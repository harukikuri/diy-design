import type { Mm } from "../domain.ts";

const SCREW_LENGTHS = [25, 32, 45, 65, 75, 90] as const;

/**
 * 貫通させる材の厚みから木ねじ長を選ぶ。
 * 相手材へ十分に効かせるため、厚みの約2倍を目安に定尺へ丸める。
 */
export function screwSpec(throughThickness: Mm): string {
  const target = throughThickness * 2;
  const length = SCREW_LENGTHS.find((l) => l >= target) ?? SCREW_LENGTHS[SCREW_LENGTHS.length - 1];
  return `${length}mm 木ねじ`;
}
