import type { Connection, FastenerType, JointMethod, PhysicalModel } from "./domain.ts";
import { JOINT_LABEL, WALL_ANCHOR } from "./domain.ts";
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
  fastener: FastenerType;
  spec: string;
  count: number;
}

/** そのステップでの留め方。どの面から、どう打つか。 */
export interface JointLine {
  method: JointMethod;
  methodLabel: string;
  spec: string;
  face: string;
  count: number;
}

/** 留め方が同じものはまとめる。手順に並べる粒度はここで決まる。 */
function aggregateJoints(connections: Connection[]): JointLine[] {
  const map = new Map<string, JointLine>();
  for (const c of connections) {
    const key = `${c.method}|${c.spec}|${c.face}`;
    const line = map.get(key);
    if (line) line.count += c.points.length;
    else
      map.set(key, {
        method: c.method,
        methodLabel: JOINT_LABEL[c.method],
        spec: c.spec,
        face: c.face,
        count: c.points.length,
      });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export interface AssemblyStep {
  index: number;
  title: string;
  instruction: string;
  /** このステップで新たに加わる部材 */
  partIds: string[];
  connectionIds: string[];
  fasteners: FastenerLine[];
  /** 留め方の内訳。「どこに打つか」だけでなく「どう打つか」を示す。 */
  joints: JointLine[];
  /** このステップ完了時点で組み上がっている部材すべて */
  cumulativePartIds: string[];
  /** 壁への固定を含むステップか */
  touchesWall: boolean;
}

function aggregateFasteners(connections: Connection[]): FastenerLine[] {
  const map = new Map<string, FastenerLine>();
  for (const c of connections) {
    // 本数は留め位置の数そのもの。図に出る点と部品表の数が必ず一致する。
    const line = map.get(c.spec);
    if (line) line.count += c.points.length;
    else map.set(c.spec, { fastener: c.fastener, spec: c.spec, count: c.points.length });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
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
      joints: aggregateJoints(connections),
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
