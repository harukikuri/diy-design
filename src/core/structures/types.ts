import type {
  Dimensions,
  Material,
  PhysicalModel,
  StructureType,
} from "../domain.ts";

/**
 * Structure Compiler (§9, §10)。
 *
 * AI は「どの Structure にするか」だけを決め、実際の部材寸法はここが計算する。
 * つまり AI が「900mm の部材を4本」と決めることは無く、
 * 「4本支柱型の棚」という Structure から Geometry Engine が寸法を導出する。
 */
export interface CompileInput {
  dimensions: Dimensions;
  params: Record<string, number>;
  /** 骨格用の角材 */
  frame: Material;
  /** 面材用の板材 */
  panel: Material;
}

export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

export interface AssemblyGroupSpec {
  key: string;
  title: string;
  instruction: string;
}

export interface DimensionConstraints {
  width: { min: number; max: number };
  height: { min: number; max: number };
  depth: { min: number; max: number };
}

export interface StructureCompiler {
  type: StructureType;
  label: string;
  /** ユーザーに見せる一行説明 */
  description: string;
  /** この構造が角材を使うか (板材のみの構造では false) */
  usesFrame: boolean;
  /**
   * 構造そのものの安定性 (0..1)。荷重の受け方と転倒しにくさの評価であり、
   * ユーザーの要望とは無関係。要望との適合は DesignCandidate.fit 側で持つ。
   */
  baseStability: number;
  constraints: DimensionConstraints;
  params: ParamSpec[];
  defaultParams(dimensions: Dimensions): Record<string, number>;
  /** 組立ステップの順序を定義する (§14)。Part.group / Connection.group と対応。 */
  assemblyGroups: AssemblyGroupSpec[];
  compile(input: CompileInput): PhysicalModel;
}

/** 棚板の高さ (上面 Y) を等間隔で求める。最上段は完成高さと一致させる。 */
export function shelfLevels(height: number, count: number): number[] {
  const levels: number[] = [];
  for (let i = 1; i <= count; i += 1) {
    levels.push(Math.round((height * i) / count));
  }
  return levels;
}
