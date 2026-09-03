import type { AssemblyStep, FastenerLine } from "./assembly.ts";
import { fastenerBom, planAssembly } from "./assembly.ts";
import type { CutPlan, CutPlanOptions } from "./cutplan.ts";
import { planCuts } from "./cutplan.ts";
import type { DesignCandidate, Dimensions, PhysicalModel, Stock } from "./domain.ts";
import { getMaterial } from "./materials.ts";
import { getStructure } from "./structures/index.ts";
import type { StructureCompiler } from "./structures/index.ts";
import type { ValidationIssue } from "./validator.ts";
import { hasErrors, validateDimensions, validateModel } from "./validator.ts";
import type { DesignEngine, DesignRequest } from "./designEngine.ts";

/**
 * 要件定義書 §21 の System Architecture をひと続きの関数にしたもの。
 *
 *   AI Design Engine → Structure Compiler → Geometry Engine
 *   → Validator → Cut Plan Engine → Assembly Engine
 */

export interface CompiledDesign {
  candidate: DesignCandidate;
  compiler: StructureCompiler;
  model: PhysicalModel;
  issues: ValidationIssue[];
  cutPlan: CutPlan;
  assembly: AssemblyStep[];
  fasteners: FastenerLine[];
  /** error が無く、木取りで置けない部材も無い */
  buildable: boolean;
}

export interface PipelineOptions extends CutPlanOptions {}

/** 1つの Design Candidate を、部材・木取り・組立手順まで展開する。 */
export function compileDesign(
  candidate: DesignCandidate,
  dimensions: Dimensions,
  ownedStock: Stock[],
  options: PipelineOptions = {},
): CompiledDesign {
  const compiler = getStructure(candidate.structure.type);
  const frame = getMaterial(candidate.structure.frameMaterialId);
  const panel = getMaterial(candidate.structure.panelMaterialId);

  const issues = [...validateDimensions(compiler, dimensions)];

  const model = hasErrors(issues)
    ? { parts: [], connections: [], bounds: { x: 0, y: 0, z: 0 } }
    : compiler.compile({ dimensions, params: candidate.structure.params, frame, panel });

  if (!hasErrors(issues)) {
    issues.push(...validateModel(model, compiler, dimensions));
  }

  const cutPlan = planCuts(model.parts, ownedStock, options);
  const assembly = planAssembly(model, compiler);

  const scored: DesignCandidate = {
    ...candidate,
    score: {
      ...candidate.score,
      materialEfficiency: cutPlan.utilization,
      simplicity: simplicityOf(model),
    },
  };

  return {
    candidate: scored,
    compiler,
    model,
    issues,
    cutPlan,
    assembly,
    fasteners: fastenerBom(model),
    buildable: !hasErrors(issues) && cutPlan.unplaced.length === 0 && model.parts.length > 0,
  };
}

/**
 * 作りやすさ。部品点数と切断本数が少ないほど高い。
 * 30部材で 0 に漸近する素直な減衰にしている。
 */
function simplicityOf(model: PhysicalModel): number {
  if (model.parts.length === 0) return 0;
  const distinctCuts = new Set(
    model.parts.map((p) =>
      p.cut.kind === "linear"
        ? `L${Math.round(p.cut.length)}`
        : `P${Math.round(p.cut.width)}x${Math.round(p.cut.length)}`,
    ),
  ).size;
  const partScore = Math.max(0, 1 - model.parts.length / 30);
  const cutScore = Math.max(0, 1 - distinctCuts / 12);
  return Number((partScore * 0.6 + cutScore * 0.4).toFixed(3));
}

/** 総合点。候補の並び順に使う。 */
export function overallScore({ score }: DesignCandidate): number {
  return score.stability * 0.45 + score.materialEfficiency * 0.35 + score.simplicity * 0.2;
}

export interface PipelineResult {
  designs: CompiledDesign[];
  notes: string[];
}

/** Intent から候補生成 → 全候補のコンパイルまでを一度に走らせる。 */
export async function runPipeline(
  engine: DesignEngine,
  request: DesignRequest,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const { candidates, notes } = await engine.propose(request);
  const designs = candidates
    .map((c) => compileDesign(c, request.dimensions, request.ownedStock, options))
    .sort((a, b) => overallScore(b.candidate) - overallScore(a.candidate));
  return { designs, notes };
}
