import type { DesignCandidate, Dimensions, Stock, StructureType } from "./domain.ts";
import { getMaterial } from "./materials.ts";
import { STRUCTURES } from "./structures/index.ts";
import type { StructureCompiler } from "./structures/index.ts";
import { validateDimensions } from "./validator.ts";

/**
 * Design Engine (§20) — AI の責務にあたる層。
 *
 * ここが決めてよいのは「どの Structure にするか」「どの材料を使うか」まで。
 * 部材寸法・木取り・幾何検証には一切踏み込まない (§4.1, Principle 1/2)。
 *
 * MVP ではルールベース実装を置き、将来ここを LLM 呼び出しに差し替えられるよう
 * DesignEngine インターフェースで抽象化している。
 */

export interface DesignRequest {
  /** 自由文の Intent。空でもよい (材料先行のケース, §5.2) */
  intent: string;
  dimensions: Dimensions;
  ownedStock: Stock[];
}

export interface DesignProposal {
  candidates: DesignCandidate[];
  /** ユーザーに伝えるべき前提や制限 */
  notes: string[];
}

export interface DesignEngine {
  name: string;
  propose(request: DesignRequest): Promise<DesignProposal>;
}

// ---------------------------------------------------------------------------
// Intent の読み取り
// ---------------------------------------------------------------------------

interface IntentSignals {
  wall: boolean;
  heavy: boolean;
  simple: boolean;
  unsupported: string | null;
}

const UNSUPPORTED_PATTERNS: [RegExp, string][] = [
  [/デスク|机|作業台|テーブル/, "デスク・テーブル"],
  [/有孔ボード|ペグボード/, "有孔ボード"],
  [/椅子|チェア|スツール/, "椅子"],
];

function readIntent(intent: string): IntentSignals {
  const text = intent.trim();
  const unsupported = UNSUPPORTED_PATTERNS.find(([re]) => re.test(text));
  return {
    wall: /壁|ウォール|浮か|見せる収納|省スペース/.test(text),
    heavy: /頑丈|丈夫|重い|重量|工具|ガレージ|本をたくさん|大量/.test(text),
    simple: /簡単|初心者|手軽|かんたん|すぐ/.test(text),
    unsupported: unsupported ? unsupported[1] : null,
  };
}

// ---------------------------------------------------------------------------
// 材料の選択
// ---------------------------------------------------------------------------

/** 手持ち材のうち、指定 kind で総長の多い材料を優先する (材料先行の利用, §23)。 */
function preferOwned(
  ownedStock: Stock[],
  kind: "lumber" | "board",
  minThickness: number,
  fallbackId: string,
): string {
  const totals = new Map<string, number>();
  for (const s of ownedStock) {
    if (!s.owned) continue;
    const m = getMaterial(s.materialId);
    if (m.kind !== kind || m.thickness < minThickness) continue;
    totals.set(s.materialId, (totals.get(s.materialId) ?? 0) + s.length * s.quantity);
  }
  const best = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : fallbackId;
}

function chooseMaterials(
  type: StructureType,
  { width, height }: Dimensions,
  signals: IntentSignals,
  ownedStock: Stock[],
): { frameMaterialId: string; panelMaterialId: string } {
  const heavyFrame = signals.heavy || height > 1500 || width > 1200;
  const frameFallback = heavyFrame ? "lumber_2x4" : "lumber_45kaku";
  // 支柱・受け桟には最低 38mm 相当の断面を要求する
  const frameMaterialId = preferOwned(ownedStock, "lumber", 38, frameFallback);

  const wideSpan = type === "box_shelf" ? width > 600 : width > 900;
  const panelFallback = wideSpan || signals.heavy ? "board_ply18" : "board_ply12";
  const panelMaterialId = preferOwned(ownedStock, "board", 12, panelFallback);

  return { frameMaterialId, panelMaterialId };
}

// ---------------------------------------------------------------------------
// ルールベース実装
// ---------------------------------------------------------------------------

const BASE_STABILITY: Record<StructureType, number> = {
  four_post_shelf: 0.9,
  box_shelf: 0.72,
  wall_shelf: 0.55,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function affinity(type: StructureType, signals: IntentSignals): number {
  let score = 0;
  if (signals.wall) score += type === "wall_shelf" ? 0.4 : -0.1;
  if (signals.heavy) score += type === "four_post_shelf" ? 0.35 : -0.15;
  if (signals.simple) score += type === "wall_shelf" ? 0.2 : type === "box_shelf" ? 0.15 : 0;
  return score;
}

function summarize(compiler: StructureCompiler, frameName: string, panelName: string): string {
  const materials = compiler.usesFrame ? `${frameName} + ${panelName}` : panelName;
  return `${compiler.description} 使用材料: ${materials}`;
}

export const ruleBasedDesignEngine: DesignEngine = {
  name: "rule-based",
  async propose({ intent, dimensions, ownedStock }: DesignRequest): Promise<DesignProposal> {
    const signals = readIntent(intent);
    const notes: string[] = [];

    if (signals.unsupported) {
      notes.push(
        `「${signals.unsupported}」は MVP の対応構造に含まれていません。棚系の構造で候補を出しています。`,
      );
    }

    const feasible = STRUCTURES.filter(
      (compiler) => validateDimensions(compiler, dimensions).length === 0,
    );

    if (feasible.length === 0) {
      notes.push("指定された寸法に適合する構造がありません。寸法を見直してください。");
      return { candidates: [], notes };
    }

    const skipped = STRUCTURES.filter((s) => !feasible.includes(s));
    for (const compiler of skipped) {
      notes.push(`${compiler.label}は指定寸法の適用範囲外のため候補から除外しました。`);
    }

    const candidates = feasible
      .map((compiler) => {
        const { frameMaterialId, panelMaterialId } = chooseMaterials(
          compiler.type,
          dimensions,
          signals,
          ownedStock,
        );
        const frame = getMaterial(frameMaterialId);
        const panel = getMaterial(panelMaterialId);
        return {
          id: `design_${compiler.type}`,
          title: compiler.label,
          summary: summarize(compiler, frame.name, panel.name),
          structure: {
            type: compiler.type,
            params: compiler.defaultParams(dimensions),
            frameMaterialId,
            panelMaterialId,
          },
          score: {
            // stability は構造そのものの判断。Intent に沿うかどうかは fit 側で持つ。
            // 残り2つは後段のエンジンが実測して上書きする。
            stability: BASE_STABILITY[compiler.type],
            materialEfficiency: 0,
            simplicity: 0,
          },
          fit: clamp01(0.5 + affinity(compiler.type, signals)),
        } satisfies DesignCandidate;
      })
      .sort((a, b) => b.fit - a.fit);

    return { candidates, notes };
  },
};
