import "server-only";

import { executeRefund } from "@/lib/circles/payout";
import { getPurchaseSnapshot } from "@/server/services/payment-service";

export async function runRefund(ticket: string) {
  const snapshot = await getPurchaseSnapshot(ticket);

  if (snapshot.paymentStatus !== "paid") {
    throw new Error("Refund can only run after payment is verified.");
  }

  if (!snapshot.payerAddress) {
    throw new Error("Refund can only run after the payer address is identified.");
  }

  return executeRefund(snapshot);
}
