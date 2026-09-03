import type { Dimensions, Stock, StructureType } from "../../src/core/domain.ts";
import { getMaterial } from "../../src/core/materials.ts";
import { compileDesign } from "../../src/core/pipeline.ts";
import type { CompiledDesign } from "../../src/core/pipeline.ts";

/**
 * エージェントに渡す設計条件。1リクエストのあいだ固定される。
 * 寸法と手持ち材料はユーザーの入力であり、エージェントは変更できない。
 */
export interface DesignContext {
  intent: string;
  dimensions: Dimensions;
  ownedStock: Stock[];
  kerf: number;
}

/** エージェントが提案できる範囲。部材寸法はここに含まれない (Principle 1/2)。 */
export interface DesignProposalInput {
  structureType: StructureType;
  shelfCount: number;
  frameMaterialId: string;
  panelMaterialId: string;
}

/**
 * エージェントに返す評価結果。
 * 完全な Physical Model ではなく、判断に必要な要約だけを返す。
 * 部材の座標や 3D 変換までは渡さない (トークンの節約と、
 * エージェントが幾何に介入しないようにするため)。
 */
export interface EvaluationSummary {
  ok: boolean;
  structure: string;
  shelfCount: number;
  materials: { frame: string; panel: string };
  parts: { total: number; distinctCuts: number };
  cut: {
    lumberPieces: number;
    sheets: number;
    utilization: number;
    estimatedCost: number;
    unplaced: string[];
  };
  scores: { stability: number; materialEfficiency: number; simplicity: number };
  issues: { level: string; message: string }[];
}

export function evaluateProposal(
  context: DesignContext,
  proposal: DesignProposalInput,
): { summary: EvaluationSummary; design: CompiledDesign } {
  const design = compileDesign(
    {
      id: `agent_${proposal.structureType}`,
      title: proposal.structureType,
      summary: "",
      structure: {
        type: proposal.structureType,
        params: { shelfCount: proposal.shelfCount },
        frameMaterialId: proposal.frameMaterialId,
        panelMaterialId: proposal.panelMaterialId,
      },
      score: { stability: 0, materialEfficiency: 0, simplicity: 0 },
      fit: 0.5,
    },
    context.dimensions,
    context.ownedStock,
    { kerf: context.kerf },
  );

  const distinctCuts = new Set(
    design.model.parts.map((p) =>
      p.cut.kind === "linear"
        ? `L${Math.round(p.cut.length)}`
        : `P${Math.round(p.cut.width)}x${Math.round(p.cut.length)}`,
    ),
  ).size;

  return {
    design,
    summary: {
      ok: design.buildable,
      structure: design.compiler.label,
      shelfCount: proposal.shelfCount,
      materials: {
        frame: getMaterial(proposal.frameMaterialId).name,
        panel: getMaterial(proposal.panelMaterialId).name,
      },
      parts: { total: design.model.parts.length, distinctCuts },
      cut: {
        lumberPieces: design.cutPlan.linear.length,
        sheets: design.cutPlan.sheets.length,
        utilization: Number(design.cutPlan.utilization.toFixed(3)),
        estimatedCost: design.cutPlan.estimatedCost,
        unplaced: design.cutPlan.unplaced.map((u) => `${u.label}: ${u.reason}`),
      },
      scores: {
        stability: design.candidate.score.stability,
        materialEfficiency: design.candidate.score.materialEfficiency,
        simplicity: design.candidate.score.simplicity,
      },
      issues: design.issues.map((i) => ({ level: i.level, message: i.message })),
    },
  };
}
