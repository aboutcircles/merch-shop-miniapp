import "server-only";

import { createPurchaseIntent } from "@/lib/circles/payment";
import { trackPurchase } from "@/lib/idempotency";
import { getMerchItemById } from "@/lib/merch-store";
import { clamp } from "@/lib/utils";

export async function createPurchaseForItem(merchItemId: string, selectedAmountCrc: string) {
  const item = await getMerchItemById(merchItemId);

  if (!item || !item.isActive || item.stock <= 0) {
    throw new Error("Merch item is unavailable.");
  }

  const min = Number(item.minPriceCrc);
  const max = Number(item.maxPriceCrc);
  const amount = Number(selectedAmountCrc);

  if (!Number.isFinite(amount)) {
    throw new Error("Invalid CRC amount.");
  }

  const normalizedAmount = clamp(amount, min, max);

  if (normalizedAmount !== amount) {
    throw new Error("Selected amount is outside the allowed range.");
  }

  const intent = createPurchaseIntent(item, amount.toFixed(2).replace(/\.00$/, ""));
  await trackPurchase(intent);

  return {
    item,
    intent,
  };
}
