import "server-only";

import { executeRefund } from "@/lib/circles/payout";
import { parsePurchaseTicket } from "@/lib/circles/payment";
import { buildPurchaseSnapshot } from "@/lib/circles/verify";

async function loadPurchaseSnapshot(ticket: string, txHash?: string) {
  const payload = parsePurchaseTicket(ticket);
  const snapshot = await buildPurchaseSnapshot(payload, ticket, txHash);

  return {
    payload,
    snapshot,
  };
}

export async function getPurchaseSnapshot(ticket: string, txHash?: string) {
  const { snapshot } = await loadPurchaseSnapshot(ticket, txHash);
  return snapshot;
}

export async function verifyAndProcessPurchase(ticket: string, txHash?: string) {
  const { payload, snapshot } = await loadPurchaseSnapshot(ticket, txHash);

  if (
    snapshot.paymentStatus === "paid" &&
    snapshot.outcomeStatus === "won" &&
    (snapshot.payoutStatus === "none" || snapshot.payoutStatus === "queued")
  ) {
    await executeRefund(snapshot);
    return buildPurchaseSnapshot(payload, ticket, txHash);
  }

  return snapshot;
}
