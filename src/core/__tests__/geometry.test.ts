import { describe, expect, it } from "vitest";
import type { Dimensions, Part, Vec3 } from "../domain.ts";
import { WALL_ANCHOR } from "../domain.ts";
import { getMaterial } from "../materials.ts";
import { getStructure } from "../structures/index.ts";
import { fastenerBom } from "../assembly.ts";
import { canScrewThrough, requiredLength } from "../structures/fasteners.ts";

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

describe("留め位置", () => {
  /** 点が、接続する2つの部材のどちらかの内側 (許容 25mm) にあるか */
  function nearParts(point: Vec3, parts: Part[], ids: string[], slack = 25): boolean {
    return parts
      .filter((p) => ids.includes(p.id))
      .some((p) =>
        (["x", "y", "z"] as const).every(
          (a) =>
            point[a] >= p.position[a] - p.size[a] / 2 - slack &&
            point[a] <= p.position[a] + p.size[a] / 2 + slack,
        ),
      );
  }

  const cases = [
    { type: "four_post_shelf" as const, dims },
    { type: "box_shelf" as const, dims: { width: 600, height: 1200, depth: 300 } },
    { type: "wall_shelf" as const, dims: { width: 900, height: 1200, depth: 250 } },
  ];

  for (const { type, dims: d } of cases) {
    const { compiler, model } = compile(type, d);

    it(`${compiler.label}: 留め位置がすべて接合する部材の上にある`, () => {
      for (const c of model.connections) {
        // 壁への固定は製作物の外なので対象外
        if (c.toPartId === WALL_ANCHOR) continue;
        for (const [i, point] of c.points.entries()) {
          expect(
            nearParts(point, model.parts, [c.fromPartId, c.toPartId]),
            `${c.id}[${i}] が部材から離れている`,
          ).toBe(true);
        }
      }
    });

    it(`${compiler.label}: 同じ接続の留め位置が重ならない`, () => {
      for (const c of model.connections) {
        const keys = c.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)}`);
        expect(new Set(keys).size, `${c.id} に重複した留め位置`).toBe(keys.length);
      }
    });

    it(`${compiler.label}: 留め位置が完成品の外形からはみ出さない`, () => {
      for (const c of model.connections) {
        for (const point of c.points) {
          expect(point.x).toBeGreaterThanOrEqual(-1);
          expect(point.x).toBeLessThanOrEqual(model.bounds.x + 1);
          expect(point.y).toBeGreaterThanOrEqual(-1);
          expect(point.y).toBeLessThanOrEqual(model.bounds.y + 1);
          expect(point.z).toBeGreaterThanOrEqual(-1);
          expect(point.z).toBeLessThanOrEqual(model.bounds.z + 1);
        }
      }
    });

    it(`${compiler.label}: 金物の本数と留め位置の数が一致する`, () => {
      const fromPoints = model.connections.reduce((n, c) => n + c.points.length, 0);
      const fromBom = fastenerBom(model).reduce((n, f) => n + f.count, 0);
      expect(fromBom).toBe(fromPoints);
    });
  }
});

describe("留め方", () => {
  const cases = [
    { type: "four_post_shelf" as const, dims },
    { type: "box_shelf" as const, dims: { width: 600, height: 1200, depth: 300 } },
    { type: "wall_shelf" as const, dims: { width: 900, height: 1200, depth: 250 } },
  ];

  const screwLength = (spec: string) => Number(/^(\d+)mm/.exec(spec)?.[1] ?? 0);
  const axisOf = (v: Vec3) => {
    const abs = { x: Math.abs(v.x), y: Math.abs(v.y), z: Math.abs(v.z) };
    return (["x", "y", "z"] as const).reduce((a, b) => (abs[b] > abs[a] ? b : a));
  };

  for (const { type, dims: d } of cases) {
    const { compiler, model } = compile(type, d);
    const byId = new Map(model.parts.map((p) => [p.id, p]));

    it(`${compiler.label}: 貫通ねじが貫通厚に対して届く`, () => {
      for (const c of model.connections) {
        if (c.method !== "through") continue;
        const axis = axisOf(c.drive);
        // ねじ頭が乗っている面を持つ材が、貫通する材
        const passed = [c.fromPartId, c.toPartId]
          .map((id) => byId.get(id))
          .find((part) =>
            part
              ? c.points.some(
                  (pt) =>
                    Math.abs(pt[axis] - (part.position[axis] - part.size[axis] / 2)) < 1 ||
                    Math.abs(pt[axis] - (part.position[axis] + part.size[axis] / 2)) < 1,
                )
              : false,
          );
        expect(passed, `${c.id} の貫通する材が特定できない`).toBeDefined();

        const thickness = passed!.size[axis];
        expect(
          screwLength(c.spec),
          `${c.id}: ${c.spec} で ${Math.round(thickness)}mm を貫通して効かせられない`,
        ).toBeGreaterThanOrEqual(requiredLength(thickness));
      }
    });

    it(`${compiler.label}: 貫通で組めない接合は貫通ねじにしない`, () => {
      for (const c of model.connections) {
        if (c.method !== "through") continue;
        const axis = axisOf(c.drive);
        for (const id of [c.fromPartId, c.toPartId]) {
          const part = byId.get(id);
          if (!part) continue;
          const onFace = c.points.some(
            (pt) =>
              Math.abs(pt[axis] - (part.position[axis] - part.size[axis] / 2)) < 1 ||
              Math.abs(pt[axis] - (part.position[axis] + part.size[axis] / 2)) < 1,
          );
          if (onFace) {
            expect(
              canScrewThrough(part.size[axis]),
              `${c.id}: ${Math.round(part.size[axis])}mm は貫通で留められない`,
            ).toBe(true);
          }
        }
      }
    });

    it(`${compiler.label}: 打つ向きが単位ベクトルで、面の指示がある`, () => {
      for (const c of model.connections) {
        const len = Math.hypot(c.drive.x, c.drive.y, c.drive.z);
        expect(len, `${c.id} の drive が向きになっていない`).toBeGreaterThan(0.9);
        expect(len).toBeLessThan(1.1);
        expect(c.face.length, `${c.id} に面の指示が無い`).toBeGreaterThan(0);
      }
    });
  }
});
