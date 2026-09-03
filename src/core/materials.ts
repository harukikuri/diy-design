import type { Material, Mm, Stock } from "./domain.ts";

/**
 * 材料カタログ (§8.1)。
 * MVP では日本のホームセンターで一般的な角材・板材に限定する (§17)。
 */
export const MATERIALS: Material[] = [
  {
    id: "lumber_2x4",
    name: "2×4材",
    kind: "lumber",
    thickness: 38,
    width: 89,
    standardLengths: [1820, 2440, 3050],
    standardPrices: [680, 880, 1180],
  },
  {
    id: "lumber_1x4",
    name: "1×4材",
    kind: "lumber",
    thickness: 19,
    width: 89,
    standardLengths: [1820, 2440],
    standardPrices: [420, 560],
  },
  {
    id: "lumber_45kaku",
    name: "45mm角材",
    kind: "lumber",
    thickness: 45,
    width: 45,
    standardLengths: [1820, 3000],
    standardPrices: [520, 860],
  },
  {
    id: "board_ply12",
    name: "構造用合板 12mm",
    kind: "board",
    thickness: 12,
    width: 910,
    standardLengths: [1820],
    standardPrices: [2280],
  },
  {
    id: "board_ply18",
    name: "構造用合板 18mm",
    kind: "board",
    thickness: 18,
    width: 910,
    standardLengths: [1820],
    standardPrices: [3480],
  },
  {
    id: "board_mdf15",
    name: "MDF 15mm",
    kind: "board",
    thickness: 15,
    width: 910,
    standardLengths: [1820],
    standardPrices: [1980],
  },
];

const BY_ID = new Map(MATERIALS.map((m) => [m.id, m]));

export function getMaterial(id: string): Material {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`未知の材料 ID: ${id}`);
  return m;
}

export function materialsOfKind(kind: Material["kind"]): Material[] {
  return MATERIALS.filter((m) => m.kind === kind);
}

/** 定尺のうち、指定長さを取れる最短のものを返す。 */
export function shortestStandardLengthFor(material: Material, length: Mm): Mm | null {
  const fit = material.standardLengths.filter((l) => l >= length).sort((a, b) => a - b);
  return fit[0] ?? null;
}

export function priceOfStandardLength(material: Material, length: Mm): number {
  const i = material.standardLengths.indexOf(length);
  return i >= 0 ? material.standardPrices[i] : 0;
}

let stockSeq = 0;
export function createStock(materialId: string, length: Mm, quantity: number, owned = true): Stock {
  stockSeq += 1;
  return { id: `stock_${stockSeq}`, materialId, length, quantity, owned };
}
