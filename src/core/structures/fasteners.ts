import type { Mm } from "../domain.ts";

const SCREW_LENGTHS = [25, 32, 45, 65, 75, 90] as const;

/**
 * 貫通させる材の厚みから木ねじ長を選ぶ。
 *
 * 相手材へ十分効かせるには厚みの 2.5 倍ほど欲しいが、突き抜けても困るので
 * 「厚み + 45mm」を上限にする。両立しない太い材では上限側を優先する。
 */
export function screwSpec(throughThickness: Mm): string {
  const capped = SCREW_LENGTHS.filter((l) => l <= throughThickness + 45);
  const candidates = capped.length > 0 ? capped : [SCREW_LENGTHS[0]];
  const length =
    candidates.find((l) => l >= throughThickness * 2.5) ?? candidates[candidates.length - 1];
  return `${length}mm 木ねじ`;
}

/**
 * from から to の内側に n 個の留め位置を等間隔で置く。
 * 端に寄せると木口が割れるので、両端は空ける。
 */
export function spread(n: number, from: Mm, to: Mm): Mm[] {
  const count = Math.max(1, Math.round(n));
  if (count === 1) return [(from + to) / 2];
  const span = to - from;
  return Array.from({ length: count }, (_, i) => from + (span * (i + 1)) / (count + 1));
}

/**
 * 貫通して留めるのに要るねじ長。
 *
 * 木工の目安は「貫通する材の厚みの約2倍」。ただし薄い板ではそれだと短すぎるので、
 * 相手材へ最低 20mm 効かせる条件も併せて満たす長さを要求する。
 *   12mm 合板 → 32mm、38mm の 2×4 → 72mm 相当 (定尺の 75mm が該当)
 */
export function requiredLength(throughThickness: Mm): Mm {
  return Math.max(throughThickness * 1.9, throughThickness + 20);
}

/**
 * 貫通で留められるか。
 *
 * 最長のねじでも貫通厚と効き代を賄えないなら、その接合は貫通では組めない。
 * 支柱の 89mm 面へ突き付けた横架材がこれに当たり、斜め打ちか金物が要る。
 */
export function canScrewThrough(throughThickness: Mm): boolean {
  return SCREW_LENGTHS[SCREW_LENGTHS.length - 1] >= requiredLength(throughThickness);
}

/** 斜め打ちに使う一般的なポケットホールビス。 */
export const POCKET_SCREW = "65mm ポケットホールビス";
