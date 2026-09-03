import { describe, expect, it } from "vitest";
import type { Dimensions, Part } from "../domain.ts";
import { WALL_ANCHOR } from "../domain.ts";
import { getMaterial } from "../materials.ts";
import { getStructure } from "../structures/index.ts";

const dims: Dimensions = { width: 800, height: 1800, depth: 400 };
const frame = getMaterial("lumber_2x4"); // 38 × 89
const panel = getMaterial("board_ply12"); // t = 12

function compile(type: Parameters<typeof getStructure>[0], d: Dimensions = dims) {
  const compiler = getStructure(type);
  return {
    compiler,
    model: compiler.compile({ dimensions: d, params: compiler.defaultParams(d), frame, panel }),
  };
}

/** 部材が完成品の外形からはみ出していないか (許容 0.5mm) */
function withinBounds(part: Part, b: { x: number; y: number; z: number }) {
  const axes = ["x", "y", "z"] as const;
  return axes.every((a) => {
    const min = part.position[a] - part.size[a] / 2;
    const max = part.position[a] + part.size[a] / 2;
    return min >= -0.5 && max <= b[a] + 0.5;
  });
}

describe("4本支柱型シェルフ", () => {
  const { model } = compile("four_post_shelf");
  const levels = 4; // defaultParams: round(1800 / 450)

  it("支柱は4本で、長さは完成高さと一致する", () => {
    const posts = model.parts.filter((p) => p.role === "post");
    expect(posts).toHaveLength(4);
    for (const post of posts) {
      expect(post.cut).toEqual({ kind: "linear", length: 1800 });
    }
  });

  it("各段に前後横架材2本・側面横架材2本・棚板1枚を持つ", () => {
    expect(model.parts.filter((p) => p.role === "rail_x")).toHaveLength(levels * 2);
    expect(model.parts.filter((p) => p.role === "rail_z")).toHaveLength(levels * 2);
    expect(model.parts.filter((p) => p.role === "shelf_panel")).toHaveLength(levels);
  });

  it("横架材の長さは支柱の断面ぶんだけ差し引かれる", () => {
    const railX = model.parts.find((p) => p.role === "rail_x")!;
    const railZ = model.parts.find((p) => p.role === "rail_z")!;
    // AI ではなく Geometry Engine が寸法を出していることの確認 (§10.2)
    expect(railX.cut).toEqual({ kind: "linear", length: 800 - 2 * frame.thickness });
    expect(railZ.cut).toEqual({ kind: "linear", length: 400 - 2 * frame.width });
  });

  it("最上段の棚板の上面が完成高さと一致する", () => {
    const panels = model.parts.filter((p) => p.role === "shelf_panel");
    const top = Math.max(...panels.map((p) => p.position.y + p.size.y / 2));
    expect(top).toBe(1800);
  });

  it("棚板は前後横架材の上に載っている", () => {
    const shelf = model.parts.find((p) => p.id === "panel_1")!;
    const rail = model.parts.find((p) => p.id === "railx_F_1")!;
    const shelfBottom = shelf.position.y - shelf.size.y / 2;
    const railTop = rail.position.y + rail.size.y / 2;
    expect(shelfBottom).toBeCloseTo(railTop, 6);
  });

  it("すべての部材が完成品の外形に収まる", () => {
    for (const part of model.parts) {
      expect(withinBounds(part, model.bounds), part.id).toBe(true);
    }
  });

  it("すべての接続が実在する部材同士を指す", () => {
    const ids = new Set(model.parts.map((p) => p.id));
    for (const c of model.connections) {
      expect(ids.has(c.fromPartId), c.id).toBe(true);
      expect(ids.has(c.toPartId) || c.toPartId === WALL_ANCHOR, c.id).toBe(true);
    }
  });
});

describe("箱型シェルフ", () => {
  const { model } = compile("box_shelf", { width: 600, height: 1200, depth: 300 });

  it("角材を使わず板材だけで構成される", () => {
    for (const part of model.parts) {
      expect(getMaterial(part.materialId).kind).toBe("board");
    }
  });

  it("天板・地板・中棚の幅は側板の内寸になる", () => {
    const horizontals = model.parts.filter((p) => p.role !== "side_panel");
    for (const part of horizontals) {
      expect(part.size.x).toBe(600 - 2 * panel.thickness);
    }
  });

  it("すべての部材が完成品の外形に収まる", () => {
    for (const part of model.parts) {
      expect(withinBounds(part, model.bounds), part.id).toBe(true);
    }
  });
});

describe("壁付けシェルフ", () => {
  const { model } = compile("wall_shelf", { width: 900, height: 1200, depth: 250 });

  it("壁への固定が接続として現れる", () => {
    const toWall = model.connections.filter((c) => c.toPartId === WALL_ANCHOR);
    expect(toWall.length).toBeGreaterThan(0);
  });

  it("壁そのものは部品表に現れない", () => {
    expect(model.parts.some((p) => p.id === WALL_ANCHOR)).toBe(false);
  });

  it("段ごとに壁受け桟と棚板を1つずつ持つ", () => {
    const ledgers = model.parts.filter((p) => p.role === "ledger");
    const panels = model.parts.filter((p) => p.role === "shelf_panel");
    expect(ledgers.length).toBe(panels.length);
  });
});
