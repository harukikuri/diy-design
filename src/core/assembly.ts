import type { Connection, PhysicalModel } from "./domain.ts";
import { WALL_ANCHOR } from "./domain.ts";
import type { StructureCompiler } from "./structures/index.ts";

/**
 * Assembly Engine (§14)。
 *
 * Structure が宣言した組立グループの順に Part / Connection を並べ、
 * 「どの順番で組み立てるか」を生成する。
 * 出力は文章ではなく、各ステップで扱う部材と金物の集合であり、
 * Visual Manual (§15) と 3D (§16) が同じデータを描画する。
 */

export interface FastenerLine {
  spec: string;
  count: number;
}

export interface AssemblyStep {
  index: number;
  title: string;
  instruction: string;
  /** このステップで新たに加わる部材 */
  partIds: string[];
  connectionIds: string[];
  fasteners: FastenerLine[];
  /** このステップ完了時点で組み上がっている部材すべて */
  cumulativePartIds: string[];
  /** 壁への固定を含むステップか */
  touchesWall: boolean;
}

function aggregateFasteners(connections: Connection[]): FastenerLine[] {
  const map = new Map<string, number>();
  for (const c of connections) {
    map.set(c.spec, (map.get(c.spec) ?? 0) + c.count);
  }
  return [...map.entries()]
    .map(([spec, count]) => ({ spec, count }))
    .sort((a, b) => b.count - a.count);
}

export function planAssembly(model: PhysicalModel, compiler: StructureCompiler): AssemblyStep[] {
  const steps: AssemblyStep[] = [];
  const cumulative: string[] = [];

  for (const group of compiler.assemblyGroups) {
    const parts = model.parts.filter((p) => p.group === group.key);
    const connections = model.connections.filter((c) => c.group === group.key);
    if (parts.length === 0 && connections.length === 0) continue;

    cumulative.push(...parts.map((p) => p.id));
    steps.push({
      index: steps.length + 1,
      title: group.title,
      instruction: group.instruction,
      partIds: parts.map((p) => p.id),
      connectionIds: connections.map((c) => c.id),
      fasteners: aggregateFasteners(connections),
      cumulativePartIds: [...cumulative],
      touchesWall: connections.some((c) => c.toPartId === WALL_ANCHOR),
    });
  }

  return steps;
}

/** 完成までに必要な金物の総数 (買い物リスト用)。 */
export function fastenerBom(model: PhysicalModel): FastenerLine[] {
  return aggregateFasteners(model.connections);
}
