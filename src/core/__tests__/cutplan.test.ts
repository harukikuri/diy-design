import { describe, expect, it } from "vitest";
import { DEFAULT_KERF, planCuts } from "../cutplan.ts";
import type { Part } from "../domain.ts";
import { createStock, getMaterial } from "../materials.ts";

const lumber = getMaterial("lumber_2x4");

function linearPart(id: string, length: number, materialId = lumber.id): Part {
  return {
    id,
    label: id,
    role: "post",
    materialId,
    size: { x: 38, y: length, z: 89 },
    position: { x: 0, y: 0, z: 0 },
    cut: { kind: "linear", length },
    group: "g",
  };
}

function panelPart(id: string, width: number, length: number): Part {
  return {
    id,
    label: id,
    role: "shelf_panel",
    materialId: "board_ply12",
    size: { x: width, y: 12, z: length },
    position: { x: 0, y: 0, z: 0 },
    cut: { kind: "panel", width, length, thickness: 12 },
    group: "g",
  };
}

describe("1D 木取り", () => {
  it("どの材も定尺を超えて切り出さない", () => {
    const parts = [600, 600, 600, 900, 900, 450, 450, 450].map((l, i) => linearPart(`p${i}`, l));
    const plan = planCuts(parts, []);
    for (const bin of plan.linear) {
      expect(bin.used).toBeLessThanOrEqual(bin.stockLength);
      expect(bin.remaining).toBeGreaterThanOrEqual(0);
    }
  });

  it("kerf を切断ごとに加算する", () => {
    const parts = [800, 500, 400].map((l, i) => linearPart(`p${i}`, l));
    const plan = planCuts(parts, [], { kerf: 5 });
    const bin = plan.linear[0];
    const cutTotal = bin.cuts.reduce((acc, c) => acc + c.length, 0);
    // n 本切り出すと切り代は n-1 回ぶん必要になる
    expect(bin.used).toBe(cutTotal + (bin.cuts.length - 1) * 5);
  });

  it("すべての部材がちょうど1回だけ木取りされる", () => {
    const parts = [1200, 1200, 700, 700, 700, 300].map((l, i) => linearPart(`p${i}`, l));
    const plan = planCuts(parts, []);
    const placed = plan.linear.flatMap((b) => b.cuts.map((c) => c.partId));
    expect(placed.sort()).toEqual(parts.map((p) => p.id).sort());
    expect(plan.unplaced).toHaveLength(0);
  });

  it("手持ち材を先に消費し、購入は不足ぶんだけになる", () => {
    const parts = [1700, 1700].map((l, i) => linearPart(`p${i}`, l));
    const plan = planCuts(parts, [createStock(lumber.id, 1820, 1, true)]);
    expect(plan.linear.filter((b) => b.owned)).toHaveLength(1);
    expect(plan.linear.filter((b) => !b.owned)).toHaveLength(1);
    expect(plan.purchase).toEqual([
      { materialId: lumber.id, length: 1820, count: 1, unitPrice: 680 },
    ]);
  });

  it("最長定尺を超える部材は理由つきで unplaced になる", () => {
    const plan = planCuts([linearPart("long", 3500)], []);
    expect(plan.linear).toHaveLength(0);
    expect(plan.unplaced).toHaveLength(1);
    expect(plan.unplaced[0].reason).toContain("3050mm");
  });

  it("既定の切り代は 3mm", () => {
    expect(planCuts([linearPart("p", 500)], []).kerf).toBe(DEFAULT_KERF);
  });
});

describe("板材の木取り", () => {
  it("配置がシートからはみ出さず、互いに重ならない", () => {
    const parts = [
      panelPart("a", 724, 400),
      panelPart("b", 724, 400),
      panelPart("c", 724, 400),
      panelPart("d", 300, 300),
    ];
    const plan = planCuts(parts, []);
    for (const sheet of plan.sheets) {
      for (const p of sheet.placements) {
        expect(p.x + p.w).toBeLessThanOrEqual(sheet.sheetWidth);
        expect(p.y + p.h).toBeLessThanOrEqual(sheet.sheetLength);
      }
      for (let i = 0; i < sheet.placements.length; i += 1) {
        for (let j = i + 1; j < sheet.placements.length; j += 1) {
          const a = sheet.placements[i];
          const b = sheet.placements[j];
          const overlap =
            a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap, `${a.partId} と ${b.partId} が重なっている`).toBe(false);
        }
      }
    }
  });

  it("シートに入らない板は unplaced になる", () => {
    const plan = planCuts([panelPart("huge", 1000, 2000)], []);
    expect(plan.unplaced).toHaveLength(1);
    expect(plan.sheets.flatMap((s) => s.placements)).toHaveLength(0);
  });

  it("歩留まりは 0〜1 に収まる", () => {
    const plan = planCuts([panelPart("a", 724, 400), linearPart("b", 900)], []);
    expect(plan.utilization).toBeGreaterThan(0);
    expect(plan.utilization).toBeLessThanOrEqual(1);
  });
});
