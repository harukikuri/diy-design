import { InMemoryRunner, LlmAgent } from "@google/adk";
import type { AgentTraceEntry, DesignResponseBody } from "../../src/api/types.ts";
import type { DesignCandidate } from "../../src/core/domain.ts";
import { ruleBasedDesignEngine } from "../../src/core/designEngine.ts";
import { getStructure } from "../../src/core/structures/index.ts";
import type { ServerConfig } from "../config.ts";
import type { DesignContext } from "./context.ts";
import type { SubmittedDesign } from "./tools.ts";
import { createCollector, createTools } from "./tools.ts";

/**
 * Design Agent (ADK)。
 *
 * 要件定義書 §4.1 の「AI は設計意図、プログラムは幾何」を、
 * エージェントとツールの境界としてそのまま実装している。
 *
 * エージェントが自分で回すループ:
 *   構造を提案 → evaluate_design で実際に部材化・検証
 *   → error/warning を読む → 段数や材料を直して再評価 → 収束したら submit
 *
 * 検証結果は Validator と Cut Plan Engine が出した実測値なので、
 * ループは「もっともらしさ」ではなく物理的な制約で回る。
 */

const APP_NAME = "diy-design-compiler";

/**
 * モデル側の失敗の扱いは 2 種類ある。
 *
 * - retry  : 一時的な混雑。少し待って同じモデルで試し直す価値がある。
 * - switch : クォータ超過。待っても枠は戻らないので、即座に別のモデルへ移る。
 *            (無料枠は概ねモデルごとに割り当てられるため、粘るより移った方が早い)
 */
const RETRYABLE_CODES = new Set(["500", "502", "503", "504"]);
const QUOTA_CODES = new Set(["429"]);

type FailureKind = "retry" | "switch" | "fatal";

class ModelError extends Error {
  readonly code: string;
  readonly kind: FailureKind;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "ModelError";
    this.code = code;
    this.kind = RETRYABLE_CODES.has(code)
      ? "retry"
      : QUOTA_CODES.has(code)
        ? "switch"
        : "fatal";
  }
}

/** 失敗の一覧から、ユーザーに出す短い理由を作る。 */
function describeFailure(failures: { model: string; error: Error }[]): string {
  const quota = failures.find((f) => f.error instanceof ModelError && f.error.code === "429");
  if (quota) {
    return "Gemini API の利用枠を使い切ったため、ルールベースの候補を表示しています";
  }
  const busy = failures.find(
    (f) => f.error instanceof ModelError && (f.error as ModelError).kind === "retry",
  );
  if (busy) {
    return "Gemini API が混雑していたため、ルールベースの候補を表示しています";
  }
  return `設計エージェントが応答しなかったため、ルールベースの候補を表示しています (${failures.at(0)?.error.message ?? "原因不明"})`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const INSTRUCTION = `あなたは DIY の設計者です。ユーザーの要望・仕上がり寸法・手持ちの材料から、実際に製作可能な設計候補を 2〜3 件まとめます。

## 守ること

1. 最初に list_structures と list_materials を必ず呼び、作れる構造と使える材料を確認する。
2. 候補は「色違い」ではなく構造そのものが異なるものを選ぶ。同じ構造で材料だけ違う案を複数出さない。
3. どの案も submit_designs に渡す前に evaluate_design で検証する。検証していない案を提出しない。
4. evaluate_design の issues に level が "error" のものが含まれる案は作れない。段数・材料・構造のいずれかを変えて再評価する。同じ案をそのまま出し直さない。
5. "warning" は作れるが注意が要る状態。採用してよいが、その内容を summary で必ず触れる。
6. 手持ちの材料があるときは、それを使い切れる案を優先して検討する。
7. 歩留まりが著しく低い (0.5 未満) 案は、材料や段数を変えて改善できないか一度は試す。
8. evaluate_design は同じターンでまとめて複数回呼んでよい。構造の異なる案は最初にまとめて評価し、往復を減らすこと。
9. 十分な案が揃ったら submit_designs を一度だけ呼んで終える。

## できないこと

部材の長さや位置を決めることはできません。あなたが決めるのは「どの構造か」「どの材料か」「何段か」だけです。実際の部材寸法・木取り・組立順序は計算側が寸法から導出します。寸法を推測して回答に含めないでください。

## 出力

submit_designs の title は 15 文字以内の日本語、summary は 80 文字以内の日本語で、その案を選ぶ理由と注意点を書きます。fit はユーザーの要望への合致度であり、構造の頑丈さではありません。`;

function buildUserMessage(context: DesignContext): string {
  const { intent, dimensions, ownedStock, kerf } = context;
  const stockLines =
    ownedStock.length > 0
      ? ownedStock
          .map((s) => `- ${s.materialId} ${s.length}mm × ${s.quantity}`)
          .join("\n")
      : "- なし";
  return [
    `## 要望`,
    intent.trim() || "(指定なし。手持ちの材料から判断してください)",
    ``,
    `## 仕上がり寸法`,
    `- 幅 ${dimensions.width}mm`,
    `- 高さ ${dimensions.height}mm`,
    `- 奥行 ${dimensions.depth}mm`,
    ``,
    `## 手持ちの材料`,
    stockLines,
    ``,
    `## 切り代`,
    `- ${kerf}mm`,
  ].join("\n");
}

/** エージェントの提案を、後段の決定論パイプラインが食える形に直す。 */
function toCandidates(submitted: SubmittedDesign[]): DesignCandidate[] {
  return submitted.map((d, i) => ({
    id: `agent_${i + 1}_${d.structureType}`,
    title: d.title,
    summary: d.summary,
    structure: {
      type: d.structureType,
      params: { shelfCount: d.shelfCount },
      frameMaterialId: d.frameMaterialId,
      panelMaterialId: d.panelMaterialId,
    },
    score: {
      // 構造そのものの安定性は構造定義から。残り2つは compileDesign が実測で埋める。
      stability: getStructure(d.structureType).baseStability,
      materialEfficiency: 0,
      simplicity: 0,
    },
    fit: d.fit,
  }));
}

/** 1つのモデルで1回だけ走らせる。モデル側のエラーは ModelError にして投げ直す。 */
async function runOnce(
  context: DesignContext,
  config: ServerConfig,
  model: string,
): Promise<DesignResponseBody> {
  const collector = createCollector();
  const agent = new LlmAgent({
    name: "diy_design_agent",
    description: "DIY の設計候補を、実際に製作可能かを検証しながら組み立てる",
    model,
    instruction: INSTRUCTION,
    tools: createTools(context, collector),
  });

  const runner = new InMemoryRunner({ agent, appName: APP_NAME });
  const session = await runner.sessionService.createSession({
    appName: APP_NAME,
    userId: "web",
  });

  let truncated = false;
  for await (const event of runner.runAsync({
    userId: "web",
    sessionId: session.id,
    newMessage: { role: "user", parts: [{ text: buildUserMessage(context) }] },
  })) {
    // モデル側の失敗をここで捕まえないと「候補を確定しなかった」と
    // 区別が付かなくなり、原因の分からないフォールバックになる
    if (event.errorCode) {
      throw new ModelError(String(event.errorCode), event.errorMessage ?? "モデルが応答しませんでした");
    }
    if (collector.trace.length >= config.maxToolCalls) {
      truncated = true;
      break;
    }
    if (collector.submitted) break;
  }

  if (!collector.submitted || collector.submitted.length === 0) {
    throw new Error(
      truncated
        ? `エージェントがツール呼び出し上限 (${config.maxToolCalls}) に達しました`
        : "エージェントが候補を確定しませんでした",
    );
  }

  const notes = [...collector.notes];
  if (truncated) {
    notes.push("検討の途中で上限に達したため、候補数を絞って返しています。");
  }

  return {
    engine: "agent",
    model,
    candidates: toCandidates(collector.submitted),
    notes,
    trace: collector.trace,
    evaluated: collector.evaluated,
  };
}

/**
 * 一時的なモデルエラーは待って再試行し、それでも駄目なら別のモデルへ移る。
 * Flash 系は時間帯によって 503 を返すため、これが無いと体感の成功率が落ちる。
 */
export async function runDesignAgent(
  context: DesignContext,
  config: ServerConfig,
): Promise<DesignResponseBody> {
  const models = [config.agentModel, ...config.fallbackModels];
  const failures: { model: string; error: Error }[] = [];

  for (const [index, model] of models.entries()) {
    for (let attempt = 0; attempt <= config.retries; attempt += 1) {
      try {
        const result = await runOnce(context, config, model);
        if (index > 0) {
          result.notes.push(
            `${config.agentModel} が使えなかったため ${model} で設計しました。`,
          );
        }
        return result;
      } catch (error) {
        const kind = error instanceof ModelError ? error.kind : "fatal";
        if (attempt === config.retries || kind !== "retry") {
          failures.push({ model, error: error as Error });
        }
        if (kind !== "retry") break; // 待っても直らないなら次のモデルへ
        if (attempt < config.retries) await sleep(600 * 2 ** attempt);
      }
    }
  }

  throw new AgentUnavailableError(describeFailure(failures), failures);
}

/** すべてのモデルで駄目だったとき。理由はユーザーに出せる文にしてある。 */
export class AgentUnavailableError extends Error {
  readonly failures: { model: string; error: Error }[];
  constructor(message: string, failures: { model: string; error: Error }[]) {
    super(message);
    this.name = "AgentUnavailableError";
    this.failures = failures;
  }
}

/** API キーが無いとき、またはエージェントが失敗したときのフォールバック。 */
export async function runRuleBased(
  context: DesignContext,
  reason?: string,
): Promise<DesignResponseBody> {
  const { candidates, notes } = await ruleBasedDesignEngine.propose({
    intent: context.intent,
    dimensions: context.dimensions,
    ownedStock: context.ownedStock,
  });

  const trace: AgentTraceEntry[] = [
    {
      step: 1,
      tool: "rule_based",
      label: reason ?? "ルールベースの設計エンジンで候補を生成",
      outcome: "info",
      facts: [{ label: "候補", value: `${candidates.length} 件` }],
    },
  ];

  return {
    engine: "rule-based",
    candidates,
    notes: reason ? [reason, ...notes] : notes,
    trace,
    evaluated: candidates.length,
  };
}
