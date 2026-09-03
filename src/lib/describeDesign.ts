import { getMaterial } from "../core/materials.ts";
import type { CompiledDesign } from "../core/pipeline.ts";

/**
 * 完成イメージ生成に渡す説明文。
 *
 * 実際に導出された部材構成から組み立てるので、段数や材料が
 * 画面に出ているものと必ず一致する。
 */
export function describeDesign(design: CompiledDesign): string {
  const { bounds } = design.model;
  const round = Math.round;

  const byMaterial = new Map<string, number>();
  for (const part of design.model.parts) {
    byMaterial.set(part.materialId, (byMaterial.get(part.materialId) ?? 0) + 1);
  }
  const materials = [...byMaterial.entries()]
    .map(([id, count]) => {
      const m = getMaterial(id);
      const size =
        m.kind === "lumber" ? `断面 ${m.thickness}×${m.width}mm` : `板厚 ${m.thickness}mm`;
      return `- ${m.name} (${size}) を ${count} 点`;
    })
    .join("\n");

  const shelves = design.model.parts.filter((p) => p.role === "shelf_panel").length;
  const fasteners = design.fasteners.map((f) => `${f.spec} ${f.count}本`).join("、");

  return [
    `${design.compiler.label}。${design.compiler.description}`,
    ``,
    `外形寸法: 幅 ${round(bounds.x)}mm × 高さ ${round(bounds.y)}mm × 奥行 ${round(bounds.z)}mm`,
    `棚の段数: ${shelves} 段`,
    ``,
    `使用材料:`,
    materials,
    ``,
    `接合: ${fasteners || "なし"}`,
  ].join("\n");
}
