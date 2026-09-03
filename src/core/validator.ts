import type { Dimensions, PhysicalModel, StructureType } from "./domain.ts";
import { getMaterial } from "./materials.ts";
import type { StructureCompiler } from "./structures/index.ts";

/**
 * Validator (§21)。
 *
 * Geometry Engine が出した部材が「現実に作れるか」を検証する。
 * error は製作不能、warning は作れるが設計上の注意点。
 */

export type IssueLevel = "error" | "warning";

export interface ValidationIssue {
  level: IssueLevel;
  code: string;
  message: string;
}

/** compile 前に、寸法が構造の適用範囲に収まっているかを見る。 */
export function validateDimensions(
  compiler: StructureCompiler,
  dimensions: Dimensions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const axes = [
    ["width", "幅", dimensions.width, compiler.constraints.width],
    ["height", "高さ", dimensions.height, compiler.constraints.height],
    ["depth", "奥行", dimensions.depth, compiler.constraints.depth],
  ] as const;

  for (const [key, label, value, range] of axes) {
    if (value < range.min || value > range.max) {
      issues.push({
        level: "error",
        code: `dimension_out_of_range:${key}`,
        message: `${label} ${Math.round(value)}mm は${compiler.label}の適用範囲 (${range.min}〜${range.max}mm) 外です。`,
      });
    }
  }
  return issues;
}

/** compile 後のモデルを検証する。 */
export function validateModel(
  model: PhysicalModel,
  compiler: StructureCompiler,
  dimensions: Dimensions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // --- 材料に収まるか -----------------------------------------------------
  for (const part of model.parts) {
    const material = getMaterial(part.materialId);
    if (part.cut.kind === "linear") {
      const max = Math.max(...material.standardLengths);
      if (part.cut.length > max) {
        issues.push({
          level: "error",
          code: "part_exceeds_stock",
          message: `${part.label} (${Math.round(part.cut.length)}mm) が ${material.name} の最長定尺 ${max}mm を超えています。`,
        });
      }
    } else {
      const sheetLength = Math.max(...material.standardLengths);
      const long = Math.max(part.cut.width, part.cut.length);
      const short = Math.min(part.cut.width, part.cut.length);
      if (short > material.width || long > sheetLength) {
        issues.push({
          level: "error",
          code: "panel_exceeds_sheet",
          message: `${part.label} (${Math.round(part.cut.width)}×${Math.round(part.cut.length)}mm) が ${material.name} のシート ${material.width}×${sheetLength}mm に入りません。`,
        });
      }
    }
    if (part.cut.kind === "linear" && part.cut.length <= 0) {
      issues.push({
        level: "error",
        code: "non_positive_part",
        message: `${part.label} の長さが 0 以下です。指定寸法に対して材料が太すぎる可能性があります。`,
      });
    }
  }

  // --- 段の有効高さ -------------------------------------------------------
  const shelfTops = model.parts
    .filter((p) => p.role === "shelf_panel" || p.role === "bottom_panel")
    .map((p) => p.position.y + p.size.y / 2)
    .sort((a, b) => a - b);
  for (let i = 1; i < shelfTops.length; i += 1) {
    const gap = shelfTops[i] - shelfTops[i - 1];
    if (gap < 180) {
      issues.push({
        level: "warning",
        code: "narrow_opening",
        message: `段の間隔が ${Math.round(gap)}mm しかありません。段数を減らすと使いやすくなります。`,
      });
      break;
    }
  }

  // --- 転倒 ---------------------------------------------------------------
  if (compiler.type !== "wall_shelf" && dimensions.height / dimensions.depth > 4) {
    issues.push({
      level: "warning",
      code: "tipping_risk",
      message: `高さが奥行の ${(dimensions.height / dimensions.depth).toFixed(1)} 倍あります。転倒防止金具で壁に固定してください。`,
    });
  }

  // --- たわみ (構造ごと) --------------------------------------------------
  issues.push(...sagIssues(compiler.type, dimensions));

  return issues;
}

function sagIssues(type: StructureType, { width, depth }: Dimensions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  switch (type) {
    case "four_post_shelf":
      if (width > 1200) {
        issues.push({
          level: "warning",
          code: "rail_span",
          message: `横架材のスパンが ${Math.round(width)}mm あります。重い物を載せる場合は中間に支柱を追加してください。`,
        });
      }
      break;
    case "box_shelf":
      if (width > 900) {
        issues.push({
          level: "warning",
          code: "shelf_sag",
          message: `棚板のスパンが ${Math.round(width)}mm あります。板材だけではたわみやすいため、幅を抑えるか背板・補強を検討してください。`,
        });
      }
      break;
    case "wall_shelf":
      if (depth > 300) {
        issues.push({
          level: "warning",
          code: "wall_shelf_depth",
          message: `奥行 ${Math.round(depth)}mm は壁付けとしては深めです。棚受け金具の耐荷重と壁下地を必ず確認してください。`,
        });
      }
      break;
  }
  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}
