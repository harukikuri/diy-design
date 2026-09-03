import { FunctionTool } from "@google/adk";
import { z } from "zod";
import type { AgentTraceEntry } from "../../src/api/types.ts";
import type { StructureType } from "../../src/core/domain.ts";
import { MATERIALS } from "../../src/core/materials.ts";
import { STRUCTURES } from "../../src/core/structures/index.ts";
import type { DesignContext, DesignProposalInput } from "./context.ts";
import { evaluateProposal } from "./context.ts";

/**
 * エージェントに渡す道具。
 *
 * すべて既存の決定論エンジンの薄いラッパであり、新しい計算はここに書かない。
 * エージェントは「どの構造・どの材料・何段か」だけを決め、その案が現実に
 * 作れるかどうかは evaluate_design が Geometry / Validator / Cut Plan を
 * 実際に通して答える。この往復が自律ループの実体になる。
 */

export interface SubmittedDesign {
  structureType: StructureType;
  shelfCount: number;
  frameMaterialId: string;
  panelMaterialId: string;
  title: string;
  summary: string;
  fit: number;
}

export interface ToolCollector {
  trace: AgentTraceEntry[];
  /** 評価した案 (採用されなかったものも含む) */
  evaluated: number;
  submitted: SubmittedDesign[] | null;
  notes: string[];
}

export function createCollector(): ToolCollector {
  return { trace: [], evaluated: 0, submitted: null, notes: [] };
}

const STRUCTURE_TYPES = STRUCTURES.map((s) => s.type) as [StructureType, ...StructureType[]];

// 骨格には角材、面材には板材しか選べないようにする。
// 角材を棚板に指定するような分類ミスは検証で弾けるが、往復が1回無駄になるので型で防ぐ。
const idsOfKind = (kind: "lumber" | "board") =>
  MATERIALS.filter((m) => m.kind === kind).map((m) => m.id) as [string, ...string[]];

const proposalShape = {
  structureType: z.enum(STRUCTURE_TYPES).describe("構造の種類"),
  shelfCount: z.number().int().min(0).max(8).describe("段数 (箱型では中棚の枚数)"),
  frameMaterialId: z.enum(idsOfKind("lumber")).describe("骨格に使う角材の材料 ID"),
  panelMaterialId: z.enum(idsOfKind("board")).describe("面材 (棚板・側板) に使う板材の材料 ID"),
};

export function createTools(context: DesignContext, collector: ToolCollector) {
  const listStructures = new FunctionTool({
    name: "list_structures",
    description:
      "作れる構造の一覧と、それぞれの適用寸法範囲・段数の範囲・角材を使うか・構造上の安定性を返す。設計を始める前に必ず一度呼ぶこと。",
    execute: () => {
      collector.trace.push({
        step: collector.trace.length + 1,
        tool: "list_structures",
        label: "作れる構造の一覧を確認",
        outcome: "info",
        facts: [{ label: "構造数", value: String(STRUCTURES.length) }],
      });
      return STRUCTURES.map((s) => ({
        type: s.type,
        label: s.label,
        description: s.description,
        usesFrame: s.usesFrame,
        baseStability: s.baseStability,
        constraints: s.constraints,
        shelfCountRange: s.params.find((p) => p.key === "shelfCount"),
        recommendedShelfCount: s.defaultParams(context.dimensions).shelfCount,
      }));
    },
  });

  const listMaterials = new FunctionTool({
    name: "list_materials",
    description:
      "材料カタログ (断面寸法・定尺・参考価格) と、ユーザーが既に持っている材料を返す。",
    execute: () => {
      collector.trace.push({
        step: collector.trace.length + 1,
        tool: "list_materials",
        label: "材料カタログと手持ち材を確認",
        outcome: "info",
        facts: [
          { label: "手持ち", value: context.ownedStock.length > 0 ? `${context.ownedStock.length} 種` : "なし" },
        ],
      });
      return {
        catalog: MATERIALS.map((m) => ({
          id: m.id,
          name: m.name,
          kind: m.kind,
          thickness: m.thickness,
          width: m.width,
          standardLengths: m.standardLengths,
          standardPrices: m.standardPrices,
        })),
        owned: context.ownedStock.map((s) => ({
          materialId: s.materialId,
          length: s.length,
          quantity: s.quantity,
        })),
      };
    },
  });

  const evaluateDesign = new FunctionTool({
    name: "evaluate_design",
    description:
      "案を実際に部材へ展開し、寸法の妥当性・木取り・概算費用・検証結果を返す。" +
      "部材寸法は計算側が決めるため、ここに寸法を渡すことはできない。" +
      "issues に error があればその案は作れないので、段数や材料を変えて再評価すること。",
    parameters: z.object(proposalShape),
    execute: (input) => {
      const proposal = input as DesignProposalInput;
      const { summary } = evaluateProposal(context, proposal);
      collector.evaluated += 1;
      collector.trace.push({
        step: collector.trace.length + 1,
        tool: "evaluate_design",
        label: `${summary.structure} / ${summary.shelfCount}段 / ${summary.materials.frame} + ${summary.materials.panel}`,
        outcome: summary.ok ? "ok" : "rejected",
        facts: [
          { label: "部材", value: `${summary.parts.total} 点` },
          { label: "歩留まり", value: `${Math.round(summary.cut.utilization * 100)}%` },
          { label: "概算", value: `¥${summary.cut.estimatedCost.toLocaleString("ja-JP")}` },
        ],
        issues: summary.issues,
      });
      return summary;
    },
  });

  const submitDesigns = new FunctionTool({
    name: "submit_designs",
    description:
      "最終候補を確定する。evaluate_design で error が出ていない案だけを、" +
      "構造が互いに異なるように 2〜3 件選んで渡すこと。作業の最後に一度だけ呼ぶ。",
    parameters: z.object({
      designs: z
        .array(
          z.object({
            ...proposalShape,
            title: z.string().describe("候補の名前 (日本語・15文字以内)"),
            summary: z
              .string()
              .describe("この案を選ぶ理由と注意点 (日本語・80文字以内)"),
            fit: z
              .number()
              .min(0)
              .max(1)
              .describe("ユーザーの要望への合致度。構造の頑丈さではない。"),
          }),
        )
        .min(1)
        .max(3),
      notes: z
        .array(z.string())
        .optional()
        .describe("ユーザーに伝える前提や制限 (対応外の要望など)"),
    }),
    execute: (input) => {
      const parsed = input as { designs: SubmittedDesign[]; notes?: string[] };
      collector.submitted = parsed.designs;
      collector.notes = parsed.notes ?? [];
      collector.trace.push({
        step: collector.trace.length + 1,
        tool: "submit_designs",
        label: `候補を ${parsed.designs.length} 件に絞り込み`,
        outcome: "ok",
        facts: parsed.designs.map((d, i) => ({
          label: `候補${i + 1}`,
          value: d.title,
        })),
      });
      return { accepted: parsed.designs.length };
    },
  });

  return [listStructures, listMaterials, evaluateDesign, submitDesigns];
}
