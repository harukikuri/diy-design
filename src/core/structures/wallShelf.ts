import type { Connection, Part, PhysicalModel } from "../domain.ts";
import { vec3, WALL_ANCHOR } from "../domain.ts";
import { screwSpec } from "./fasteners.ts";
import type { CompileInput, StructureCompiler } from "./types.ts";
import { shelfLevels } from "./types.ts";

/**
 * Wall Shelf — 壁に直接固定する棚。支柱を持たない。
 *
 * 構成:
 *   壁受け桟 (ledger) 各段1本 … 壁下地にねじ止めし、棚板の奥側を受ける
 *   棚板 (panel) 各段1枚      … 壁受け桟の上に載せ、手前は L字棚受け金具で支える
 *
 * 床面積を取らず部品点数も最小だが、耐荷重は壁下地の位置と金具に依存する。
 * 壁 (Z+ 側) は製作物ではないため WALL_ANCHOR として接続先にのみ現れる。
 */
function compile({ dimensions, params, frame, panel }: CompileInput): PhysicalModel {
  const { width: W, height: H, depth: D } = dimensions;
  const ft = frame.thickness;
  const fw = frame.width;
  const pt = panel.thickness;

  const parts: Part[] = [];
  const connections: Connection[] = [];

  const levels = shelfLevels(H, params.shelfCount);

  levels.forEach((levelY, i) => {
    const n = i + 1;
    const ledgerId = `ledger_${n}`;
    const panelId = `panel_${n}`;
    const ledgerCenterY = levelY - pt - fw / 2;

    parts.push({
      id: ledgerId,
      label: `壁受け桟 (${n}段目)`,
      role: "ledger",
      materialId: frame.id,
      size: vec3(W, fw, ft),
      position: vec3(W / 2, ledgerCenterY, D - ft / 2),
      cut: { kind: "linear", length: W },
      group: "ledger",
    });
    connections.push({
      id: `c_${ledgerId}_wall`,
      fromPartId: ledgerId,
      toPartId: WALL_ANCHOR,
      fastener: "screw",
      spec: "75mm 木ねじ (壁下地へ)",
      count: Math.max(2, Math.ceil(W / 455)), // 455mm = 一般的な間柱ピッチ
      at: vec3(W / 2, ledgerCenterY, D),
      group: "ledger",
    });

    connections.push({
      id: `c_${panelId}_bracket`,
      fromPartId: panelId,
      toPartId: WALL_ANCHOR,
      fastener: "bracket",
      spec: `L字棚受け金具 ${Math.round(D * 0.8)}mm`,
      count: Math.max(2, Math.ceil(W / 600)),
      at: vec3(W / 2, ledgerCenterY, D - ft),
      group: "brackets",
    });

    parts.push({
      id: panelId,
      label: `棚板 (${n}段目)`,
      role: "shelf_panel",
      materialId: panel.id,
      size: vec3(W, pt, D),
      position: vec3(W / 2, levelY - pt / 2, D / 2),
      cut: { kind: "panel", width: W, length: D, thickness: pt },
      group: "panels",
    });
    connections.push({
      id: `c_${panelId}_${ledgerId}`,
      fromPartId: panelId,
      toPartId: ledgerId,
      fastener: "screw",
      spec: screwSpec(pt),
      count: Math.max(2, Math.ceil(W / 400)),
      at: vec3(W / 2, levelY - pt / 2, D - ft / 2),
      group: "panels",
    });
  });

  return { parts, connections, bounds: vec3(W, H, D) };
}

export const wallShelf: StructureCompiler = {
  type: "wall_shelf",
  label: "壁付けシェルフ",
  description: "壁受け桟とL字金具で壁に直付けする。床を占有せず部品も最小だが、耐荷重は壁下地に依存する。",
  usesFrame: true,
  constraints: {
    width: { min: 300, max: 1800 },
    height: { min: 200, max: 2400 },
    depth: { min: 100, max: 400 },
  },
  params: [{ key: "shelfCount", label: "段数", min: 1, max: 5, step: 1 }],
  defaultParams: ({ height }) => ({
    shelfCount: Math.max(1, Math.min(4, Math.round(height / 450))),
  }),
  assemblyGroups: [
    {
      key: "ledger",
      title: "壁受け桟を壁に固定する",
      instruction: "下地センサーで間柱を探し、水平器で水平を出しながら壁受け桟をねじ止めする。",
    },
    {
      key: "brackets",
      title: "L字棚受け金具を取り付ける",
      instruction: "壁受け桟の下端に合わせてL字金具を等間隔に取り付ける。棚板の手前側の荷重を受ける。",
    },
    {
      key: "panels",
      title: "棚板を載せて固定する",
      instruction: "棚板を壁受け桟と金具の上に載せ、上から、または金具の下穴から固定する。",
    },
  ],
  compile,
};
