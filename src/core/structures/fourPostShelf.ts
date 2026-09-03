import type { Connection, Part, PhysicalModel } from "../domain.ts";
import { vec3 } from "../domain.ts";
import { screwSpec } from "./fasteners.ts";
import type { CompileInput, StructureCompiler } from "./types.ts";
import { shelfLevels } from "./types.ts";

/**
 * Four Post Shelf — 4本の支柱と横架材で骨格を組み、棚板を載せる構造。
 *
 * 構成:
 *   支柱 4本                     … 高さ方向 (Y)
 *   側面横架材 (rail_z) 各段2本   … 左右の側面フレームを構成し、奥行方向 (Z) に渡す
 *   前後横架材 (rail_x) 各段2本   … 左右のフレームを幅方向 (X) に連結し、棚板を受ける
 *   棚板 (panel) 各段1枚          … 前後横架材の上に載る
 */
function compile({ dimensions, params, frame, panel }: CompileInput): PhysicalModel {
  const { width: W, height: H, depth: D } = dimensions;
  const t = frame.thickness; // 支柱の X 方向寸法 (2×4 なら 38)
  const w = frame.width; // 支柱の Z 方向寸法 (2×4 なら 89)
  const pt = panel.thickness;

  const parts: Part[] = [];
  const connections: Connection[] = [];

  // --- 支柱 ---------------------------------------------------------------
  const postX = { L: t / 2, R: W - t / 2 };
  const postZ = { F: w / 2, B: D - w / 2 };
  const sides = [
    { key: "L", label: "左", x: postX.L, group: "frame_left" },
    { key: "R", label: "右", x: postX.R, group: "frame_right" },
  ] as const;

  for (const side of sides) {
    for (const [zKey, zLabel, z] of [
      ["F", "前", postZ.F],
      ["B", "後", postZ.B],
    ] as const) {
      parts.push({
        id: `post_${side.key}${zKey}`,
        label: `支柱 (${side.label}${zLabel})`,
        role: "post",
        materialId: frame.id,
        size: vec3(t, H, w),
        position: vec3(side.x, H / 2, z),
        cut: { kind: "linear", length: H },
        group: side.group,
      });
    }
  }

  // --- 各段 ---------------------------------------------------------------
  const levels = shelfLevels(H, params.shelfCount);
  const railLenZ = D - 2 * w; // 側面横架材: 前後の支柱の間に渡す
  const railLenX = W - 2 * t; // 前後横架材: 左右のフレームの間に渡す
  const frameScrew = screwSpec(t);
  const panelScrew = screwSpec(pt);

  levels.forEach((levelY, i) => {
    const n = i + 1;
    const railCenterY = levelY - pt - frame.width / 2; // 棚板の下に横架材の上端が来る

    // 側面横架材 (左右)
    for (const side of sides) {
      const id = `railz_${side.key}_${n}`;
      parts.push({
        id,
        label: `側面横架材 (${side.label}・${n}段目)`,
        role: "rail_z",
        materialId: frame.id,
        size: vec3(t, frame.width, railLenZ),
        position: vec3(side.x, railCenterY, D / 2),
        cut: { kind: "linear", length: railLenZ },
        group: side.group,
      });
      for (const [zKey, z] of [
        ["F", w],
        ["B", D - w],
      ] as const) {
        connections.push({
          id: `c_${id}_${zKey}`,
          fromPartId: id,
          toPartId: `post_${side.key}${zKey}`,
          fastener: "screw",
          spec: frameScrew,
          count: 2,
          at: vec3(side.x, railCenterY, z),
          group: side.group,
        });
      }
    }

    // 前後横架材
    for (const [xKey, xLabel, z] of [
      ["F", "前", t / 2],
      ["B", "後", D - t / 2],
    ] as const) {
      const id = `railx_${xKey}_${n}`;
      parts.push({
        id,
        label: `前後横架材 (${xLabel}・${n}段目)`,
        role: "rail_x",
        materialId: frame.id,
        size: vec3(railLenX, frame.width, t),
        position: vec3(W / 2, railCenterY, z),
        cut: { kind: "linear", length: railLenX },
        group: "connect",
      });
      for (const side of sides) {
        connections.push({
          id: `c_${id}_${side.key}`,
          fromPartId: id,
          toPartId: `post_${side.key}${xKey}`,
          fastener: "screw",
          spec: frameScrew,
          count: 2,
          at: vec3(side.x, railCenterY, z),
          group: "connect",
        });
      }
    }

    // 棚板
    const panelId = `panel_${n}`;
    parts.push({
      id: panelId,
      label: `棚板 (${n}段目)`,
      role: "shelf_panel",
      materialId: panel.id,
      size: vec3(railLenX, pt, D),
      position: vec3(W / 2, levelY - pt / 2, D / 2),
      cut: { kind: "panel", width: railLenX, length: D, thickness: pt },
      group: "panels",
    });
    for (const [xKey, z] of [
      ["F", t / 2],
      ["B", D - t / 2],
    ] as const) {
      connections.push({
        id: `c_${panelId}_${xKey}`,
        fromPartId: panelId,
        toPartId: `railx_${xKey}_${n}`,
        fastener: "screw",
        spec: panelScrew,
        count: 3,
        at: vec3(W / 2, levelY - pt / 2, z),
        group: "panels",
      });
    }
  });

  return { parts, connections, bounds: vec3(W, H, D) };
}

export const fourPostShelf: StructureCompiler = {
  type: "four_post_shelf",
  label: "4本支柱型シェルフ",
  description: "角材の支柱と横架材で骨格を組み、棚板を載せる。荷重に強く、段数を増やしやすい。",
  usesFrame: true,
  constraints: {
    width: { min: 300, max: 2400 },
    height: { min: 400, max: 2400 },
    depth: { min: 200, max: 900 },
  },
  params: [{ key: "shelfCount", label: "段数", min: 2, max: 8, step: 1 }],
  defaultParams: ({ height }) => ({
    shelfCount: Math.max(2, Math.min(6, Math.round(height / 450))),
  }),
  assemblyGroups: [
    {
      key: "frame_left",
      title: "左側面フレームを組む",
      instruction: "左の支柱2本に側面横架材を各段ねじ止めし、はしご状のフレームを作る。",
    },
    {
      key: "frame_right",
      title: "右側面フレームを組む",
      instruction: "同じ手順で右側面フレームを作る。左右が鏡像になっていることを確認する。",
    },
    {
      key: "connect",
      title: "左右のフレームを連結する",
      instruction: "前後横架材で左右のフレームをつなぐ。直角を確認しながら締める。",
    },
    {
      key: "panels",
      title: "棚板を取り付ける",
      instruction: "前後横架材の上に棚板を載せ、上から木ねじで固定する。",
    },
  ],
  compile,
};
