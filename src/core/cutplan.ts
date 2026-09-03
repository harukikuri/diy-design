import type { Material, Mm, Part, Stock } from "./domain.ts";
import { getMaterial, priceOfStandardLength, shortestStandardLengthFor } from "./materials.ts";

/**
 * Cut Plan Engine (§13)。
 *
 * 必要な Part と手持ちの Stock から「どの材料のどこを切るか」を決める。
 * MVP の対象は 1D Cutting Stock Problem。板材については、木取り図を出すために
 * 簡易的なストリップパッキング (2D) を行う (高度な 2D 最適化は §18 で対象外)。
 */

export type LinearAlgorithm = "first_fit_decreasing" | "best_fit_decreasing";

export interface LinearCut {
  partId: string;
  label: string;
  length: Mm;
  /** 材の先頭からのオフセット (kerf を含む) */
  offset: Mm;
}

export interface LinearBin {
  id: string;
  materialId: string;
  stockLength: Mm;
  owned: boolean;
  cuts: LinearCut[];
  /** 切断長と kerf の合計 */
  used: Mm;
  remaining: Mm;
}

export interface PanelPlacement {
  partId: string;
  label: string;
  /** シート幅方向 (X) の位置 */
  x: Mm;
  /** シート長方向 (Y) の位置 */
  y: Mm;
  w: Mm;
  h: Mm;
  rotated: boolean;
}

export interface SheetBin {
  id: string;
  materialId: string;
  sheetWidth: Mm;
  sheetLength: Mm;
  owned: boolean;
  placements: PanelPlacement[];
  usedArea: number;
}

export interface PurchaseLine {
  materialId: string;
  length: Mm;
  count: number;
  unitPrice: number;
}

export interface UnplacedPart {
  partId: string;
  label: string;
  reason: string;
}

export interface CutPlan {
  linear: LinearBin[];
  sheets: SheetBin[];
  unplaced: UnplacedPart[];
  kerf: Mm;
  algorithm: LinearAlgorithm;
  /** 消費した材料のうち、実際に部材になった割合 (金額換算 0..1) */
  utilization: number;
  purchase: PurchaseLine[];
  estimatedCost: number;
}

export const DEFAULT_KERF: Mm = 3;

// ---------------------------------------------------------------------------
// 手持ち材料
// ---------------------------------------------------------------------------

interface Piece {
  length: Mm;
}

function expandOwned(stocks: Stock[], materialId: string): Piece[] {
  const pieces: Piece[] = [];
  for (const s of stocks) {
    if (s.materialId !== materialId || !s.owned) continue;
    for (let i = 0; i < s.quantity; i += 1) pieces.push({ length: s.length });
  }
  return pieces.sort((a, b) => a.length - b.length);
}

/** 定尺でない長さも含めて概算単価を出す (手持ち材の価値評価用)。 */
function estimatePrice(material: Material, length: Mm): number {
  const exact = priceOfStandardLength(material, length);
  if (exact > 0) return exact;
  const base = material.standardLengths[0];
  const basePrice = material.standardPrices[0];
  return (basePrice / base) * length;
}

// ---------------------------------------------------------------------------
// 1D: 角材の木取り
// ---------------------------------------------------------------------------

interface LinearRequirement {
  partId: string;
  label: string;
  length: Mm;
}

function packLinear(
  reqs: LinearRequirement[],
  material: Material,
  owned: Piece[],
  kerf: Mm,
  algorithm: LinearAlgorithm,
): { bins: LinearBin[]; unplaced: UnplacedPart[] } {
  const bins: LinearBin[] = [];
  const unplaced: UnplacedPart[] = [];
  const pool = owned.map((p) => p.length);
  let seq = 0;

  const need = (bin: LinearBin, length: Mm) => (bin.cuts.length > 0 ? kerf : 0) + length;

  const sorted = [...reqs].sort((a, b) => b.length - a.length);

  for (const req of sorted) {
    // 1. 開いている材に入るか
    const candidates = bins.filter((b) => b.materialId === material.id && b.remaining >= need(b, req.length));
    let bin: LinearBin | undefined;
    if (algorithm === "first_fit_decreasing") {
      bin = candidates[0];
    } else {
      bin = candidates.reduce<LinearBin | undefined>((best, b) => {
        if (!best) return b;
        return b.remaining - need(b, req.length) < best.remaining - need(best, req.length) ? b : best;
      }, undefined);
    }

    // 2. 入らなければ新しい材を下ろす。手持ち材を優先する。
    if (!bin) {
      const ownedIdx = pool.findIndex((l) => l >= req.length);
      let stockLength: Mm;
      let isOwned: boolean;
      if (ownedIdx >= 0) {
        stockLength = pool.splice(ownedIdx, 1)[0];
        isOwned = true;
      } else {
        const std = shortestStandardLengthFor(material, req.length);
        if (std === null) {
          unplaced.push({
            partId: req.partId,
            label: req.label,
            reason: `${Math.round(req.length)}mm は ${material.name} の最長定尺 ${Math.max(...material.standardLengths)}mm を超える`,
          });
          continue;
        }
        stockLength = std;
        isOwned = false;
      }
      seq += 1;
      bin = {
        id: `${material.id}_${seq}`,
        materialId: material.id,
        stockLength,
        owned: isOwned,
        cuts: [],
        used: 0,
        remaining: stockLength,
      };
      bins.push(bin);
    }

    const offset = bin.used + (bin.cuts.length > 0 ? kerf : 0);
    const consumed = need(bin, req.length);
    bin.cuts.push({ partId: req.partId, label: req.label, length: req.length, offset });
    bin.used += consumed;
    bin.remaining -= consumed;
  }

  return { bins, unplaced };
}

// ---------------------------------------------------------------------------
// 2D: 板材の木取り (First Fit Decreasing Height)
// ---------------------------------------------------------------------------

interface PanelRequirement {
  partId: string;
  label: string;
  a: Mm;
  b: Mm;
}

interface Strip {
  y: Mm;
  h: Mm;
  usedX: Mm;
}

function packSheets(
  reqs: PanelRequirement[],
  material: Material,
  owned: Piece[],
  kerf: Mm,
): { sheets: SheetBin[]; unplaced: UnplacedPart[] } {
  const SW = material.width;
  const defaultLength = material.standardLengths[0];
  const unplaced: UnplacedPart[] = [];
  const sheets: SheetBin[] = [];
  const strips: Strip[][] = [];
  const pool = owned.map((p) => p.length).sort((a, b) => a - b);
  let seq = 0;

  /**
   * 1本のストリップに何枚並ぶかと、そのストリップが食うシート長を比べて向きを決める。
   * 長辺を幅方向に寝かせるより、短辺を並べた方が長さを節約できることが多い。
   */
  const yieldOf = (w: Mm, h: Mm) => Math.floor((SW + kerf) / (w + kerf)) / h;

  const oriented = reqs
    .map((r) => {
      const options = [
        { w: r.a, h: r.b },
        { w: r.b, h: r.a },
      ].filter((o) => o.w <= SW);
      const best = options.length
        ? options.reduce((x, y) => (yieldOf(y.w, y.h) > yieldOf(x.w, x.h) ? y : x))
        : { w: Math.min(r.a, r.b), h: Math.max(r.a, r.b) }; // どう置いても入らない
      return { ...r, w: best.w, h: best.h, rotated: best.w !== r.a };
    })
    .sort((x, y) => y.h - x.h);

  /** minLength を収められる手持ちシートがあればそれを、無ければ定尺を下ろす。 */
  const openSheet = (minLength: Mm): SheetBin => {
    seq += 1;
    const ownedIdx = pool.findIndex((l) => l >= minLength);
    let sheetLength = defaultLength;
    let isOwned = false;
    if (ownedIdx >= 0) {
      sheetLength = pool.splice(ownedIdx, 1)[0];
      isOwned = true;
    }
    const sheet: SheetBin = {
      id: `${material.id}_sheet_${seq}`,
      materialId: material.id,
      sheetWidth: SW,
      sheetLength,
      owned: isOwned,
      placements: [],
      usedArea: 0,
    };
    sheets.push(sheet);
    strips.push([]);
    return sheet;
  };

  for (const r of oriented) {
    if (r.w > SW) {
      unplaced.push({
        partId: r.partId,
        label: r.label,
        reason: `${Math.round(r.w)}×${Math.round(r.h)}mm は ${material.name} のシート ${SW}×${defaultLength}mm に入らない`,
      });
      continue;
    }

    let placed = false;
    for (let i = 0; i < sheets.length && !placed; i += 1) {
      const sheet = sheets[i];
      if (r.h > sheet.sheetLength) continue;
      const sheetStrips = strips[i];

      // 既存のストリップに入れる
      for (const strip of sheetStrips) {
        const needX = strip.usedX + (strip.usedX > 0 ? kerf : 0) + r.w;
        if (r.h <= strip.h && needX <= SW) {
          const x = strip.usedX + (strip.usedX > 0 ? kerf : 0);
          sheet.placements.push({ partId: r.partId, label: r.label, x, y: strip.y, w: r.w, h: r.h, rotated: r.rotated });
          sheet.usedArea += r.w * r.h;
          strip.usedX = needX;
          placed = true;
          break;
        }
      }
      if (placed) break;

      // 新しいストリップを開く
      const bottom = sheetStrips.reduce((acc, s) => Math.max(acc, s.y + s.h), 0);
      const y = bottom > 0 ? bottom + kerf : 0;
      if (y + r.h <= sheet.sheetLength) {
        sheetStrips.push({ y, h: r.h, usedX: r.w });
        sheet.placements.push({ partId: r.partId, label: r.label, x: 0, y, w: r.w, h: r.h, rotated: r.rotated });
        sheet.usedArea += r.w * r.h;
        placed = true;
      }
    }

    if (!placed) {
      const sheet = openSheet(r.h);
      if (r.h > sheet.sheetLength) {
        unplaced.push({
          partId: r.partId,
          label: r.label,
          reason: `${Math.round(r.w)}×${Math.round(r.h)}mm は ${material.name} のシートに入らない`,
        });
        continue;
      }
      strips[sheets.length - 1].push({ y: 0, h: r.h, usedX: r.w });
      sheet.placements.push({ partId: r.partId, label: r.label, x: 0, y: 0, w: r.w, h: r.h, rotated: r.rotated });
      sheet.usedArea += r.w * r.h;
    }
  }

  return { sheets, unplaced };
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

export interface CutPlanOptions {
  kerf?: Mm;
}

export function planCuts(parts: Part[], ownedStock: Stock[], options: CutPlanOptions = {}): CutPlan {
  const kerf = options.kerf ?? DEFAULT_KERF;

  const linearByMaterial = new Map<string, LinearRequirement[]>();
  const panelByMaterial = new Map<string, PanelRequirement[]>();

  for (const part of parts) {
    if (part.cut.kind === "linear") {
      const list = linearByMaterial.get(part.materialId) ?? [];
      list.push({ partId: part.id, label: part.label, length: part.cut.length });
      linearByMaterial.set(part.materialId, list);
    } else {
      const list = panelByMaterial.get(part.materialId) ?? [];
      list.push({ partId: part.id, label: part.label, a: part.cut.width, b: part.cut.length });
      panelByMaterial.set(part.materialId, list);
    }
  }

  const linear: LinearBin[] = [];
  const sheets: SheetBin[] = [];
  const unplaced: UnplacedPart[] = [];

  // 1D は FFD と BFD の両方を走らせ、材の本数 → 残材の少ない方を採る (§13.4)
  let chosenAlgorithm: LinearAlgorithm = "first_fit_decreasing";
  for (const [materialId, reqs] of linearByMaterial) {
    const material = getMaterial(materialId);
    const owned = expandOwned(ownedStock, materialId);
    const ffd = packLinear(reqs, material, owned, kerf, "first_fit_decreasing");
    const bfd = packLinear(reqs, material, owned, kerf, "best_fit_decreasing");
    const waste = (r: { bins: LinearBin[] }) => r.bins.reduce((acc, b) => acc + b.remaining, 0);
    const better =
      bfd.bins.length < ffd.bins.length || (bfd.bins.length === ffd.bins.length && waste(bfd) < waste(ffd))
        ? bfd
        : ffd;
    if (better === bfd) chosenAlgorithm = "best_fit_decreasing";
    linear.push(...better.bins);
    unplaced.push(...better.unplaced);
  }

  for (const [materialId, reqs] of panelByMaterial) {
    const material = getMaterial(materialId);
    const owned = expandOwned(ownedStock, materialId);
    const result = packSheets(reqs, material, owned, kerf);
    sheets.push(...result.sheets);
    unplaced.push(...result.unplaced);
  }

  // --- 購入リストと効率 ---------------------------------------------------
  const purchaseMap = new Map<string, PurchaseLine>();
  let consumedValue = 0;
  let usefulValue = 0;

  for (const bin of linear) {
    const material = getMaterial(bin.materialId);
    const price = estimatePrice(material, bin.stockLength);
    consumedValue += price;
    const cutLength = bin.cuts.reduce((acc, c) => acc + c.length, 0);
    usefulValue += price * (cutLength / bin.stockLength);
    if (!bin.owned) {
      const key = `${bin.materialId}:${bin.stockLength}`;
      const line = purchaseMap.get(key);
      if (line) line.count += 1;
      else
        purchaseMap.set(key, {
          materialId: bin.materialId,
          length: bin.stockLength,
          count: 1,
          unitPrice: priceOfStandardLength(material, bin.stockLength),
        });
    }
  }

  for (const sheet of sheets) {
    const material = getMaterial(sheet.materialId);
    const price = estimatePrice(material, sheet.sheetLength);
    consumedValue += price;
    usefulValue += price * (sheet.usedArea / (sheet.sheetWidth * sheet.sheetLength));
    if (!sheet.owned) {
      const key = `${sheet.materialId}:${sheet.sheetLength}`;
      const line = purchaseMap.get(key);
      if (line) line.count += 1;
      else
        purchaseMap.set(key, {
          materialId: sheet.materialId,
          length: sheet.sheetLength,
          count: 1,
          unitPrice: priceOfStandardLength(material, sheet.sheetLength),
        });
    }
  }

  const purchase = [...purchaseMap.values()];
  return {
    linear,
    sheets,
    unplaced,
    kerf,
    algorithm: chosenAlgorithm,
    utilization: consumedValue > 0 ? usefulValue / consumedValue : 0,
    purchase,
    estimatedCost: purchase.reduce((acc, p) => acc + p.unitPrice * p.count, 0),
  };
}
