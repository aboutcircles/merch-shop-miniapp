import "server-only";

import { executeRefund } from "@/lib/circles/payout";
import { parsePurchaseTicket } from "@/lib/circles/payment";
import { buildPurchaseSnapshot, type BuildPurchaseSnapshotOptions } from "@/lib/circles/verify";
import { getCachedSnapshot, setCachedSnapshot } from "@/lib/purchase-cache";

function getSnapshotCacheKey(ticket: string, txHash?: string) {
  return `${ticket}:${txHash ?? ""}`;
}

async function loadPurchaseSnapshot(ticket: string, txHash?: string, options?: BuildPurchaseSnapshotOptions) {
  const payload = parsePurchaseTicket(ticket);
  const snapshot = await buildPurchaseSnapshot(payload, ticket, txHash, options);

  return {
    payload,
    snapshot,
  };
}

export async function getPurchaseSnapshot(
  ticket: string,
  txHash?: string,
  options?: Omit<BuildPurchaseSnapshotOptions, "persistDerivedState" | "persistPaymentDetails">,
) {
  const useCache = !options;

  if (useCache) {
    const cacheKey = getSnapshotCacheKey(ticket, txHash);
    const cached = getCachedSnapshot(cacheKey);

    if (cached) {
      return cached;
    }

    const { snapshot } = await loadPurchaseSnapshot(ticket, txHash, {
      persistDerivedState: false,
      persistPaymentDetails: false,
    });
    setCachedSnapshot(cacheKey, snapshot.purchaseId, snapshot);
    return snapshot;
  }

  const { snapshot } = await loadPurchaseSnapshot(ticket, txHash, {
    ...options,
    persistDerivedState: false,
    persistPaymentDetails: false,
  });
  return snapshot;
}

export async function verifyAndProcessPurchase(ticket: string, txHash?: string, options?: BuildPurchaseSnapshotOptions) {
  const { payload, snapshot } = await loadPurchaseSnapshot(ticket, txHash, options);

  if (
    snapshot.paymentStatus === "paid" &&
    snapshot.outcomeStatus === "won" &&
    (snapshot.payoutStatus === "none" || snapshot.payoutStatus === "queued")
  ) {
    await executeRefund(snapshot);
    const nextOptions = options ? { ...options } : undefined;

    if (nextOptions) {
      delete nextOptions.trackedPurchase;
    }

    return buildPurchaseSnapshot(payload, ticket, txHash, nextOptions);
  }

  return snapshot;
}
