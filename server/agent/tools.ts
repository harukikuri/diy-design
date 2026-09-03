import { FunctionTool } from "@google/adk";
import { z } from "zod";
import type { AgentTraceEntry } from "../../src/api/types.ts";
import type { StructureType } from "../../src/core/domain.ts";
import { MATERIALS } from "../../src/core/materials.ts";
import { getStructure, STRUCTURES } from "../../src/core/structures/index.ts";
import type { DesignContext, DesignProposalInput } from "./context.ts";
import { evaluateProposal } from "./context.ts";

/**
 * エージェントに渡す道具。
 *
 * すべて既存の決定論エンジンの薄いラッパであり、新しい計算はここに書かない。
 * エージェントは「どの構造・どの材料・何段か」だけを決め、その案が現実に
 * 作れるかどうかは evaluate_design が Geometry / Validator / Cut Plan を
 * 実際に通して答える。この往復が自律ループの実体になる。
 */

export interface SubmittedDesign {
  structureType: StructureType;
  shelfCount: number;
  frameMaterialId: string;
  panelMaterialId: string;
  title: string;
  summary: string;
  fit: number;
}

export interface ToolCollector {
  trace: AgentTraceEntry[];
  /**
   * 決定論エンジンに通した組み合わせの総数。掃引で計算した分も含む。
   * 表示用であり、上限判定には使わない。
   */
  evaluated: number;
  /**
   * エージェントが evaluate_design を直接呼んだ回数。上限judgeはこちらで行う。
   * 掃引はエンジン側の計算なので、いくら回っても上限を消費しない。
   */
  directEvaluations: number;
  submitted: SubmittedDesign[] | null;
  notes: string[];
  /** 同じ案を二度評価させないための記憶 */
  seen: Map<string, unknown>;
  /** 足跡が増えるたびに呼ばれる。進行中の画面へ流すために使う。 */
  onTrace?: (entry: AgentTraceEntry) => void;
}

export function createCollector(onTrace?: (entry: AgentTraceEntry) => void): ToolCollector {
  return {
    trace: [],
    evaluated: 0,
    directEvaluations: 0,
    submitted: null,
    notes: [],
    seen: new Map(),
    onTrace,
  };
}

/** 足跡を1つ積み、購読者がいればその場で流す。 */
function record(collector: ToolCollector, entry: Omit<AgentTraceEntry, "step">): void {
  const full: AgentTraceEntry = { ...entry, step: collector.trace.length + 1 };
  collector.trace.push(full);
  collector.onTrace?.(full);
}

const proposalKey = (p: DesignProposalInput) =>
  `${p.structureType}|${p.shelfCount}|${p.frameMaterialId}|${p.panelMaterialId}`;

const STRUCTURE_TYPES = STRUCTURES.map((s) => s.type) as [StructureType, ...StructureType[]];

// 骨格には角材、面材には板材しか選べないようにする。
// 角材を棚板に指定するような分類ミスは検証で弾けるが、往復が1回無駄になるので型で防ぐ。
const idsOfKind = (kind: "lumber" | "board") =>
  MATERIALS.filter((m) => m.kind === kind).map((m) => m.id) as [string, ...string[]];

const proposalShape = {
  structureType: z.enum(STRUCTURE_TYPES).describe("構造の種類"),
  shelfCount: z.number().int().min(0).max(8).describe("段数 (箱型では中棚の枚数)"),
  frameMaterialId: z.enum(idsOfKind("lumber")).describe("骨格に使う角材の材料 ID"),
  panelMaterialId: z.enum(idsOfKind("board")).describe("面材 (棚板・側板) に使う板材の材料 ID"),
};

export function createTools(
  context: DesignContext,
  collector: ToolCollector,
  maxEvaluations = 6,
) {
  const listStructures = new FunctionTool({
    name: "list_structures",
    description:
      "作れる構造の一覧と、それぞれの適用寸法範囲・段数の範囲・角材を使うか・構造上の安定性を返す。設計を始める前に必ず一度呼ぶこと。",
    execute: () => {
      record(collector, {
        tool: "list_structures",
        label: "作れる構造の一覧を確認",
        outcome: "info",
        facts: [{ label: "構造数", value: String(STRUCTURES.length) }],
      });
      return STRUCTURES.map((s) => ({
        type: s.type,
        label: s.label,
        description: s.description,
        usesFrame: s.usesFrame,
        baseStability: s.baseStability,
        constraints: s.constraints,
        shelfCountRange: s.params.find((p) => p.key === "shelfCount"),
        recommendedShelfCount: s.defaultParams(context.dimensions).shelfCount,
      }));
    },
  });

  const listMaterials = new FunctionTool({
    name: "list_materials",
    description:
      "材料カタログ (断面寸法・定尺・参考価格) と、ユーザーが既に持っている材料を返す。",
    execute: () => {
      record(collector, {
        tool: "list_materials",
        label: "材料カタログと手持ち材を確認",
        outcome: "info",
        facts: [
          { label: "手持ち", value: context.ownedStock.length > 0 ? `${context.ownedStock.length} 種` : "なし" },
        ],
      });
      return {
        catalog: MATERIALS.map((m) => ({
          id: m.id,
          name: m.name,
          kind: m.kind,
          thickness: m.thickness,
          width: m.width,
          standardLengths: m.standardLengths,
          standardPrices: m.standardPrices,
        })),
        owned: context.ownedStock.map((s) => ({
          materialId: s.materialId,
          length: s.length,
          quantity: s.quantity,
        })),
      };
    },
  });

  const evaluateDesign = new FunctionTool({
    name: "evaluate_design",
    description:
      "案を実際に部材へ展開し、寸法の妥当性・木取り・概算費用・検証結果を返す。" +
      "部材寸法は計算側が決めるため、ここに寸法を渡すことはできない。" +
      "issues に error があればその案は作れないので、段数や材料を変えて再評価すること。",
    parameters: z.object(proposalShape),
    execute: (input) => {
      const proposal = input as DesignProposalInput;
      const key = proposalKey(proposal);

      // 同じ案を二度評価しても結果は変わらない。往復とトークンの無駄なので弾く。
      const cached = collector.seen.get(key);
      if (cached) {
        return { ...(cached as object), note: "この案は評価済みです。結果は同じです。" };
      }
      if (collector.directEvaluations >= maxEvaluations) {
        return {
          error: `評価は ${maxEvaluations} 回までです。これまでの結果から submit_designs を呼んでください。`,
        };
      }

      const { summary } = evaluateProposal(context, proposal);
      collector.seen.set(key, summary);
      collector.evaluated += 1;
      collector.directEvaluations += 1;
      record(collector, {
        tool: "evaluate_design",
        label: `${summary.structure} / ${summary.shelfCount}段 / ${summary.materials.frame} + ${summary.materials.panel}`,
        outcome: summary.ok ? "ok" : "rejected",
        facts: [
          { label: "部材", value: `${summary.parts.total} 点` },
          { label: "歩留まり", value: `${Math.round(summary.cut.utilization * 100)}%` },
          { label: "概算", value: `¥${summary.cut.estimatedCost.toLocaleString("ja-JP")}` },
        ],
        issues: summary.issues,
      });
      return summary;
    },
  });

  const compareOptions = new FunctionTool({
    name: "compare_options",
    description:
      "1つの構造について、段数と板材のすべての組み合わせを実際に部材へ展開し、" +
      "歩留まり・部材点数・概算費用・検証結果の件数を表で返す。" +
      "候補を選ぶ前にこれを呼べば、1回の往復で全体像が手に入る。" +
      "個別の指摘内容まで見たいときは evaluate_design を使う。",
    parameters: z.object({
      structureType: z.enum(STRUCTURE_TYPES).describe("比較する構造"),
      frameMaterialId: z.enum(idsOfKind("lumber")).describe("骨格に使う角材 (固定)"),
    }),
    execute: (input) => {
      const { structureType, frameMaterialId } = input as {
        structureType: StructureType;
        frameMaterialId: string;
      };
      const compiler = getStructure(structureType);
      const range = compiler.params.find((p) => p.key === "shelfCount");
      const panels = MATERIALS.filter((m) => m.kind === "board");

      const rows: Record<string, unknown>[] = [];
      for (let n = range?.min ?? 1; n <= (range?.max ?? 6); n += 1) {
        for (const panel of panels) {
          const proposal = {
            structureType,
            shelfCount: n,
            frameMaterialId,
            panelMaterialId: panel.id,
          };
          const { summary } = evaluateProposal(context, proposal);
          // 掃引で通した案は検証済みとして扱う (submit_designs はこれを見る)
          collector.seen.set(proposalKey(proposal), summary);
          rows.push({
            shelfCount: n,
            panelMaterialId: panel.id,
            // 板厚は棚板のたわみにくさの目安。強度の判断材料として必ず見せる。
            panelThickness: panel.thickness,
            ok: summary.ok,
            parts: summary.parts.total,
            utilization: summary.cut.utilization,
            cost: summary.cut.estimatedCost,
            errors: summary.issues.filter((i) => i.level === "error").length,
            warnings: summary.issues.filter((i) => i.level === "warning").length,
          });
        }
      }

      /*
       * 表を小さくするために選ぶ理由の無い行を落とす。ただし比較は同じ段数どうしに限る。
       *
       * 段数は棚の機能そのもの (段が多いほど収納が増える) なので、
       * 段数をまたいで「部材が少ない方が良い」と判定すると、
       * ただ段数の少ない案が勝ってしまう。板厚も同様に、薄い方が安いからといって
       * 落とすと強度の選択肢が消える。したがって段数ごとに、
       * 歩留まり・費用・板厚のすべてで劣る材料の組み合わせだけを落とす。
       */
      collector.evaluated += rows.length;
      const buildable = rows.filter((r) => r.ok);
      const frontier = buildable.filter(
        (a) =>
          !buildable.some(
            (b) =>
              b !== a &&
              b.shelfCount === a.shelfCount &&
              (b.utilization as number) >= (a.utilization as number) &&
              (b.cost as number) <= (a.cost as number) &&
              (b.panelThickness as number) >= (a.panelThickness as number) &&
              ((b.utilization as number) > (a.utilization as number) ||
                (b.cost as number) < (a.cost as number) ||
                (b.panelThickness as number) > (a.panelThickness as number)),
          ),
      );
      record(collector, {
        tool: "compare_options",
        label: `${compiler.label}: ${rows.length} 通りを比較`,
        outcome: "info",
        facts: [
          { label: "作れる", value: `${buildable.length} 通り` },
          { label: "非劣解", value: `${frontier.length} 通り` },
          {
            label: "最高歩留まり",
            value: buildable.length
              ? `${Math.round(Math.max(...buildable.map((r) => r.utilization as number)) * 100)}%`
              : "—",
          },
          {
            label: "最安",
            value: buildable.length
              ? `¥${Math.min(...buildable.map((r) => r.cost as number)).toLocaleString("ja-JP")}`
              : "—",
          },
        ],
      });
      return {
        structure: compiler.label,
        frameMaterialId,
        evaluated: rows.length,
        buildable: buildable.length,
        // 他に全面的に勝る案が無い行だけを返す。落とした行は選ぶ理由が無いもの。
        note:
          "同じ段数の中で、歩留まり・費用・板厚のすべてで他に劣る板材だけを省いてある。" +
          "段数は削っていない。板厚は棚板のたわみにくさの目安で、重い物を載せるなら厚い方が良い。",
        rows: frontier,
      };
    },
  });

  const submitDesigns = new FunctionTool({
    name: "submit_designs",
    description:
      "最終候補を確定する。evaluate_design で error が出ていない案だけを、" +
      "構造が互いに異なるように 2〜3 件選んで渡すこと。作業の最後に一度だけ呼ぶ。",
    parameters: z.object({
      designs: z
        .array(
          z.object({
            ...proposalShape,
            title: z.string().describe("候補の名前 (日本語・15文字以内)"),
            summary: z
              .string()
              .describe("この案を選ぶ理由と注意点 (日本語・80文字以内)"),
            fit: z
              .number()
              .min(0)
              .max(1)
              .describe("ユーザーの要望への合致度。構造の頑丈さではない。"),
          }),
        )
        .min(1)
        .max(3),
      notes: z
        .array(z.string())
        .optional()
        .describe("ユーザーに伝える前提や制限 (対応外の要望など)"),
    }),
    execute: (input) => {
      const parsed = input as { designs: SubmittedDesign[]; notes?: string[] };

      // 検証を通っていない案をユーザーに出さない。指示ではなくここで保証する。
      const unverified = parsed.designs.filter((d) => !collector.seen.has(proposalKey(d)));
      if (unverified.length > 0) {
        return {
          error:
            "検証していない案は確定できません。次の案を evaluate_design か compare_options で先に評価してください: " +
            unverified
              .map((d) => `${d.structureType}/${d.shelfCount}段/${d.panelMaterialId}`)
              .join(", "),
        };
      }

      collector.submitted = parsed.designs;
      collector.notes = parsed.notes ?? [];
      record(collector, {
        tool: "submit_designs",
        label: `候補を ${parsed.designs.length} 件に絞り込み`,
        outcome: "ok",
        facts: parsed.designs.map((d, i) => ({
          label: `候補${i + 1}`,
          value: d.title,
        })),
      });
      return { accepted: parsed.designs.length };
    },
  });

  return [listStructures, listMaterials, compareOptions, evaluateDesign, submitDesigns];
}
