import type { Connection, Part, PhysicalModel } from "../domain.ts";
import { vec3 } from "../domain.ts";
import { screwSpec } from "./fasteners.ts";
import type { CompileInput, StructureCompiler } from "./types.ts";

/**
 * Box Shelf — 板材だけで箱を組み、その中に中棚を入れる構造。
 *
 * 構成:
 *   側板 2枚          … 高さ方向に立てる。箱の左右。
 *   地板 / 天板       … 側板の間に渡して箱にする。
 *   中棚 n枚          … 箱の内側を等分する。
 *
 * 角材を使わないため部品点数が少なく、切断も直線だけで済む。
 */
function compile({ dimensions, params, panel }: CompileInput): PhysicalModel {
  const { width: W, height: H, depth: D } = dimensions;
  const t = panel.thickness;

  const parts: Part[] = [];
  const connections: Connection[] = [];
  const screw = screwSpec(t);

  // --- 側板 ---------------------------------------------------------------
  for (const [key, label, x] of [
    ["L", "左", t / 2],
    ["R", "右", W - t / 2],
  ] as const) {
    parts.push({
      id: `side_${key}`,
      label: `側板 (${label})`,
      role: "side_panel",
      materialId: panel.id,
      size: vec3(t, H, D),
      position: vec3(x, H / 2, D / 2),
      cut: { kind: "panel", width: D, length: H, thickness: t },
      group: "bottom",
    });
  }

  const innerWidth = W - 2 * t;
  const sideX = { L: t / 2, R: W - t / 2 };

  /** 側板の間に水平に渡す板を1枚追加し、左右の側板への接続も張る。 */
  const addHorizontal = (
    id: string,
    label: string,
    role: Part["role"],
    centerY: number,
    group: string,
  ) => {
    parts.push({
      id,
      label,
      role,
      materialId: panel.id,
      size: vec3(innerWidth, t, D),
      position: vec3(W / 2, centerY, D / 2),
      cut: { kind: "panel", width: innerWidth, length: D, thickness: t },
      group,
    });
    for (const [key, x] of [
      ["L", sideX.L],
      ["R", sideX.R],
    ] as const) {
      connections.push({
        id: `c_${id}_${key}`,
        fromPartId: `side_${key}`,
        toPartId: id,
        fastener: "screw",
        spec: screw,
        count: 3,
        at: vec3(x, centerY, D / 2),
        group,
      });
    }
  };

  addHorizontal("panel_bottom", "地板", "bottom_panel", t / 2, "bottom");
  addHorizontal("panel_top", "天板", "top_panel", H - t / 2, "top");

  // --- 中棚 ---------------------------------------------------------------
  const innerHeight = H - 2 * t;
  const openings = params.shelfCount + 1;
  for (let i = 1; i <= params.shelfCount; i += 1) {
    const centerY = t + (innerHeight * i) / openings;
    addHorizontal(`panel_shelf_${i}`, `中棚 (${i}段目)`, "shelf_panel", centerY, "shelves");
  }

  return { parts, connections, bounds: vec3(W, H, D) };
}

export const boxShelf: StructureCompiler = {
  type: "box_shelf",
  label: "箱型シェルフ",
  description: "板材だけで箱を組む。部品点数が少なく直線切りのみで作れるが、幅を広げるとたわみやすい。",
  usesFrame: false,
  constraints: {
    width: { min: 250, max: 1200 },
    height: { min: 250, max: 1820 },
    depth: { min: 150, max: 900 },
  },
  params: [{ key: "shelfCount", label: "中棚の枚数", min: 0, max: 6, step: 1 }],
  defaultParams: ({ height }) => ({
    shelfCount: Math.max(1, Math.min(5, Math.round(height / 400) - 1)),
  }),
  assemblyGroups: [
    {
      key: "bottom",
      title: "側板に地板を固定する",
      instruction: "側板2枚の内側に中棚の位置を墨付けしてから、地板を左右の側板で挟んでねじ止めする。",
    },
    {
      key: "top",
      title: "天板を固定して箱にする",
      instruction: "天板を同じ要領で取り付ける。対角線の長さを測り、箱がねじれていないか確認する。",
    },
    {
      key: "shelves",
      title: "中棚を入れる",
      instruction: "墨付けした位置に中棚を差し込み、側板の外側からねじ止めする。",
    },
  ],
  compile,
};
