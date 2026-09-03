import { describe, expect, it } from "vitest";
import { createStock } from "../../../src/core/materials.ts";
import type { DesignContext } from "../context.ts";
import { evaluateProposal } from "../context.ts";
import { createCollector, createTools } from "../tools.ts";

const context: DesignContext = {
  intent: "本を置く棚",
  dimensions: { width: 800, height: 1800, depth: 400 },
  ownedStock: [],
  kerf: 3,
};

const sane = {
  structureType: "four_post_shelf" as const,
  shelfCount: 4,
  frameMaterialId: "lumber_2x4",
  panelMaterialId: "board_ply12",
};

describe("evaluate_design が返す評価", () => {
  it("妥当な案は ok で返り、木取りまで通る", () => {
    const { summary } = evaluateProposal(context, sane);
    expect(summary.ok).toBe(true);
    expect(summary.parts.total).toBeGreaterThan(0);
    expect(summary.cut.unplaced).toHaveLength(0);
    expect(summary.cut.estimatedCost).toBeGreaterThan(0);
  });

  it("適用範囲外の寸法は error として返り、エージェントが直せる材料になる", () => {
    const tooBig: DesignContext = {
      ...context,
      dimensions: { width: 3000, height: 3000, depth: 1200 },
    };
    const { summary } = evaluateProposal(tooBig, sane);
    expect(summary.ok).toBe(false);
    expect(summary.issues.some((i) => i.level === "error")).toBe(true);
  });

  it("段数を詰めすぎると warning が返る", () => {
    const { summary } = evaluateProposal(context, { ...sane, shelfCount: 8 });
    expect(summary.issues.some((i) => i.level === "warning")).toBe(true);
  });

  it("手持ち材があれば購入費が下がる", () => {
    const withStock: DesignContext = {
      ...context,
      ownedStock: [createStock("lumber_2x4", 1820, 6, true)],
    };
    const bare = evaluateProposal(context, sane).summary.cut.estimatedCost;
    const owned = evaluateProposal(withStock, sane).summary.cut.estimatedCost;
    expect(owned).toBeLessThan(bare);
  });

  it("エージェントには部材の座標を渡さない", () => {
    const { summary } = evaluateProposal(context, sane);
    // 幾何はプログラムの領分。要約に位置情報が混ざっていないことを固定する。
    expect(JSON.stringify(summary)).not.toMatch(/position|transform|"x":/);
  });
});

describe("ツール", () => {
  it("エージェントが必要とする道具を揃える", () => {
    const tools = createTools(context, createCollector());
    expect(tools.map((t) => t.name)).toEqual([
      "list_structures",
      "list_materials",
      "compare_options",
      "evaluate_design",
      "submit_designs",
    ]);
  });

  it("評価するたびに足跡が残る", async () => {
    const collector = createCollector();
    const tools = createTools(context, collector);
    const evaluate = tools.find((t) => t.name === "evaluate_design")!;

    await evaluate.runAsync({ args: sane } as never);
    await evaluate.runAsync({ args: { ...sane, shelfCount: 8 } } as never);

    expect(collector.evaluated).toBe(2);
    expect(collector.trace).toHaveLength(2);
    expect(collector.trace[0].outcome).toBe("ok");
    expect(collector.trace[1].issues?.length).toBeGreaterThan(0);
  });

  it("submit_designs が最終候補を確定する", async () => {
    const collector = createCollector();
    const tools = createTools(context, collector);
    const evaluate = tools.find((t) => t.name === "evaluate_design")!;
    const submit = tools.find((t) => t.name === "submit_designs")!;

    // 検証を通っていない案は確定できないので、先に評価しておく
    await evaluate.runAsync({ args: sane } as never);
    await submit.runAsync({
      args: {
        designs: [{ ...sane, title: "頑丈な4本支柱", summary: "荷重に強い", fit: 0.8 }],
        notes: ["注記"],
      },
    } as never);

    expect(collector.submitted).toHaveLength(1);
    expect(collector.submitted![0].title).toBe("頑丈な4本支柱");
    expect(collector.notes).toEqual(["注記"]);
  });
});

describe("提案できる範囲", () => {
  it("骨格には角材、面材には板材しか選べない", () => {
    const tools = createTools(context, createCollector());
    const evaluate = tools.find((t) => t.name === "evaluate_design")!;
    // 宣言を覗いてスキーマを固定する
    const declaration = (evaluate as unknown as {
      _getDeclaration: () => unknown;
    })._getDeclaration() as {
      parameters: { properties: Record<string, { enum?: string[] }> };
    };
    const schema = declaration.parameters.properties;
    expect(schema.frameMaterialId.enum).toContain("lumber_2x4");
    expect(schema.frameMaterialId.enum).not.toContain("board_ply12");
    expect(schema.panelMaterialId.enum).toContain("board_ply12");
    expect(schema.panelMaterialId.enum).not.toContain("lumber_1x4");
  });
});

describe("探索の歯止め", () => {
  const proposals = [
    { ...sane, shelfCount: 3 },
    { ...sane, shelfCount: 4 },
    { ...sane, shelfCount: 5 },
  ];

  it("同じ案を二度評価しない", async () => {
    const collector = createCollector();
    const evaluate = createTools(context, collector).find((t) => t.name === "evaluate_design")!;

    await evaluate.runAsync({ args: sane } as never);
    const again = (await evaluate.runAsync({ args: sane } as never)) as { note?: string };

    expect(collector.evaluated).toBe(1);
    expect(again.note).toContain("評価済み");
  });

  it("評価回数の上限に達したら確定を促す", async () => {
    const collector = createCollector();
    const evaluate = createTools(context, collector, 2).find((t) => t.name === "evaluate_design")!;

    for (const p of proposals) await evaluate.runAsync({ args: p } as never);
    const blocked = (await evaluate.runAsync({
      args: { ...sane, shelfCount: 6 },
    } as never)) as { error?: string };

    expect(collector.directEvaluations).toBe(2);
    expect(blocked.error).toContain("submit_designs");
  });
});

describe("掃引と確定の保証", () => {
  it("compare_options は段数と板材の全組み合わせを1回で返す", async () => {
    const collector = createCollector();
    const compare = createTools(context, collector).find((t) => t.name === "compare_options")!;

    const result = (await compare.runAsync({
      args: { structureType: "four_post_shelf", frameMaterialId: "lumber_2x4" },
    } as never)) as {
      evaluated: number;
      buildable: number;
      rows: {
        shelfCount: number;
        ok: boolean;
        utilization: number;
        cost: number;
        panelThickness: number;
      }[];
    };

    // 段数 2〜8 × 板材3種 を実際に計算している
    expect(result.evaluated).toBe(7 * 3);
    // 返すのは非劣解だけなので、全組み合わせより少ない
    expect(result.rows.length).toBeLessThan(result.evaluated);
    expect(result.rows.length).toBeGreaterThan(0);
    // 同じ段数の中で支配関係にある行が残っていないこと
    for (const a of result.rows) {
      for (const b of result.rows) {
        if (a === b || a.shelfCount !== b.shelfCount) continue;
        const dominates =
          b.utilization >= a.utilization &&
          b.cost <= a.cost &&
          b.panelThickness >= a.panelThickness &&
          (b.utilization > a.utilization || b.cost < a.cost || b.panelThickness > a.panelThickness);
        expect(dominates).toBe(false);
      }
    }

    // 段数の選択肢は削らない (段数は棚の機能そのもの)
    const shelfCounts = new Set(result.rows.map((r) => r.shelfCount));
    expect(shelfCounts.size).toBe(7);

    // 厚い板材が「高いから」という理由だけで消えていないこと
    expect(result.rows.some((r) => r.panelThickness === 18)).toBe(true);
    // 掃引でも往復は1回。足跡も1行だけ。
    expect(collector.trace).toHaveLength(1);
  });

  it("掃引した案は検証済みとして扱われ、そのまま確定できる", async () => {
    const collector = createCollector();
    const tools = createTools(context, collector);
    const compare = tools.find((t) => t.name === "compare_options")!;
    const submit = tools.find((t) => t.name === "submit_designs")!;

    await compare.runAsync({
      args: { structureType: "four_post_shelf", frameMaterialId: "lumber_2x4" },
    } as never);
    const ok = (await submit.runAsync({
      args: {
        designs: [{ ...sane, title: "4本支柱", summary: "頑丈", fit: 0.8 }],
      },
    } as never)) as { accepted?: number; error?: string };

    expect(ok.error).toBeUndefined();
    expect(ok.accepted).toBe(1);
  });

  it("検証していない案は確定できない", async () => {
    const collector = createCollector();
    const submit = createTools(context, collector).find((t) => t.name === "submit_designs")!;

    const rejected = (await submit.runAsync({
      args: {
        designs: [{ ...sane, title: "未検証", summary: "通らないはず", fit: 0.8 }],
      },
    } as never)) as { error?: string };

    expect(rejected.error).toContain("検証していない案は確定できません");
    expect(collector.submitted).toBeNull();
  });
});

describe("検証件数の数え方", () => {
  it("掃引した組み合わせも検証件数に数える", async () => {
    const collector = createCollector();
    const compare = createTools(context, collector).find((t) => t.name === "compare_options")!;

    await compare.runAsync({
      args: { structureType: "four_post_shelf", frameMaterialId: "lumber_2x4" },
    } as never);

    // 画面に「0 通りを検証」と出さないための担保
    expect(collector.evaluated).toBe(7 * 3);
  });

  it("掃引は evaluate_design の回数上限を消費しない", async () => {
    const collector = createCollector();
    const tools = createTools(context, collector, 2);
    const compare = tools.find((t) => t.name === "compare_options")!;
    const evaluate = tools.find((t) => t.name === "evaluate_design")!;

    await compare.runAsync({
      args: { structureType: "four_post_shelf", frameMaterialId: "lumber_2x4" },
    } as never);
    // 掃引で 21 通り回っていても、直接評価はまだ 0 回なので拒否されない
    const result = (await evaluate.runAsync({
      args: { ...sane, shelfCount: 2, panelMaterialId: "board_ply12" },
    } as never)) as { error?: string; note?: string };

    expect(result.error).toBeUndefined();
    expect(collector.directEvaluations).toBeLessThanOrEqual(1);
  });
});
