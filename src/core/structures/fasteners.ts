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
