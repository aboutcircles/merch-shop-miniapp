import { clamp } from "@/lib/utils";

export const MIN_REFUND_CHANCE_PERCENT = 15;
export const MAX_REFUND_CHANCE_PERCENT = 51;

export function calculateRefundChancePercentFromRatio(ratio: number) {
  const normalizedRatio = clamp(ratio, 0, 1);
  return Math.round(
    MIN_REFUND_CHANCE_PERCENT +
      normalizedRatio * (MAX_REFUND_CHANCE_PERCENT - MIN_REFUND_CHANCE_PERCENT),
  );
}

export function calculateRefundChancePercentForAmount(
  minPriceCrc: string | number,
  maxPriceCrc: string | number,
  selectedAmountCrc: string | number,
) {
  const min = Number(minPriceCrc);
  const max = Number(maxPriceCrc);
  const selected = Number(selectedAmountCrc);

  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(selected)) {
    return MIN_REFUND_CHANCE_PERCENT;
  }

  if (max <= min) {
    return MAX_REFUND_CHANCE_PERCENT;
  }

  const ratio = (selected - min) / (max - min);
  return calculateRefundChancePercentFromRatio(ratio);
}
