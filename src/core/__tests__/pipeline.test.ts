import { describe, expect, it } from "vitest";
import { ruleBasedDesignEngine } from "../designEngine.ts";
import { createStock } from "../materials.ts";
import { overallScore, runPipeline } from "../pipeline.ts";

const dims = { width: 800, height: 1800, depth: 400 };

describe("パイプライン", () => {
  it("Intent と寸法から、作れる候補を複数返す", async () => {
    const { designs } = await runPipeline(ruleBasedDesignEngine, {
      intent: "本を置く棚を作りたい",
      dimensions: dims,
      ownedStock: [],
    });
    expect(designs.length).toBeGreaterThanOrEqual(2);
    expect(designs.every((d) => d.buildable)).toBe(true);
  });

  it("候補は総合点の降順に並ぶ", async () => {
    const { designs } = await runPipeline(ruleBasedDesignEngine, {
      intent: "棚",
      dimensions: dims,
      ownedStock: [],
    });
    const scores = designs.map((d) => overallScore(d.candidate));
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("組立手順がすべての部材を重複なく網羅する", async () => {
    const { designs } = await runPipeline(ruleBasedDesignEngine, {
      intent: "棚",
      dimensions: dims,
      ownedStock: [],
    });
    for (const design of designs) {
      const stepped = design.assembly.flatMap((s) => s.partIds);
      expect(new Set(stepped).size, design.candidate.title).toBe(stepped.length);
      expect(stepped.sort()).toEqual(design.model.parts.map((p) => p.id).sort());
      const last = design.assembly[design.assembly.length - 1];
      expect(last.cumulativePartIds).toHaveLength(design.model.parts.length);
    }
  });

  it("スコアの材料効率と作りやすさは実測値で埋まる", async () => {
    const { designs } = await runPipeline(ruleBasedDesignEngine, {
      intent: "棚",
      dimensions: dims,
      ownedStock: [],
    });
    for (const { candidate, cutPlan } of designs) {
      expect(candidate.score.materialEfficiency).toBe(cutPlan.utilization);
      expect(candidate.score.simplicity).toBeGreaterThan(0);
    }
  });

  it("壁付けの Intent では壁付けシェルフが最上位になる", async () => {
    const { designs } = await runPipeline(ruleBasedDesignEngine, {
      intent: "壁に浮かせて省スペースにしたい",
      dimensions: { width: 900, height: 1200, depth: 250 },
      ownedStock: [],
    });
    expect(designs[0].candidate.structure.type).toBe("wall_shelf");
  });

  it("Intent なし・手持ち材のみでも候補を返す (材料先行)", async () => {
    const { designs } = await runPipeline(ruleBasedDesignEngine, {
      intent: "",
      dimensions: dims,
      ownedStock: [createStock("lumber_2x4", 1820, 6), createStock("board_ply12", 1820, 1)],
    });
    expect(designs.length).toBeGreaterThan(0);
    const used = designs[0].cutPlan.linear.filter((b) => b.owned);
    expect(used.length).toBeGreaterThan(0);
  });

  it("対応外の Intent は候補を出しつつ注記で伝える", async () => {
    const { notes } = await runPipeline(ruleBasedDesignEngine, {
      intent: "デスクを作りたい",
      dimensions: dims,
      ownedStock: [],
    });
    expect(notes.join()).toContain("デスク");
  });

  it("適用範囲外の寸法は error として報告される", async () => {
    const { designs, notes } = await runPipeline(ruleBasedDesignEngine, {
      intent: "棚",
      dimensions: { width: 3000, height: 3000, depth: 1200 },
      ownedStock: [],
    });
    expect(designs).toHaveLength(0);
    expect(notes.join()).toContain("寸法");
  });
});
