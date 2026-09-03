import { describe, expect, it } from "vitest";
import { runRuleBased } from "../agent/designAgent.ts";
import { toContext } from "../routes.ts";

describe("リクエストの検証", () => {
  const valid = {
    intent: "棚",
    dimensions: { width: 800, height: 1800, depth: 400 },
    stock: [{ materialId: "lumber_2x4", length: 1820, quantity: 3 }],
    kerf: 3,
  };

  it("正しいリクエストを設計条件に直す", () => {
    const context = toContext(valid);
    expect(context.dimensions.width).toBe(800);
    expect(context.ownedStock).toHaveLength(1);
    expect(context.ownedStock[0].owned).toBe(true);
  });

  it("寸法が欠けていれば弾く", () => {
    expect(() => toContext({ dimensions: { width: 0, height: 1, depth: 1 } })).toThrow(/幅・高さ・奥行/);
    expect(() => toContext({})).toThrow();
  });

  it("未知の材料 ID を弾く", () => {
    expect(() =>
      toContext({ ...valid, stock: [{ materialId: "lumber_9x9", length: 1820, quantity: 1 }] }),
    ).toThrow();
  });

  it("切り代は 0〜10mm に丸める", () => {
    expect(toContext({ ...valid, kerf: 99 }).kerf).toBe(10);
    expect(toContext({ ...valid, kerf: -1 }).kerf).toBe(0);
  });

  it("Intent は長すぎれば切り詰める", () => {
    expect(toContext({ ...valid, intent: "あ".repeat(1000) }).intent).toHaveLength(400);
  });
});

describe("フォールバック", () => {
  const context = {
    intent: "棚",
    dimensions: { width: 800, height: 1800, depth: 400 },
    ownedStock: [],
    kerf: 3,
  };

  it("API キーが無くてもルールベースで候補を返す", async () => {
    const result = await runRuleBased(context);
    expect(result.engine).toBe("rule-based");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.trace).toHaveLength(1);
  });

  it("失敗理由を渡すと notes の先頭に出る", async () => {
    const result = await runRuleBased(context, "エージェントが応答しませんでした");
    expect(result.notes[0]).toContain("応答しませんでした");
  });
});
