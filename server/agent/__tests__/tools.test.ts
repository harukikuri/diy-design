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
  it("エージェントが必要とする4つの道具を揃える", () => {
    const tools = createTools(context, createCollector());
    expect(tools.map((t) => t.name)).toEqual([
      "list_structures",
      "list_materials",
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
    const submit = tools.find((t) => t.name === "submit_designs")!;

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
