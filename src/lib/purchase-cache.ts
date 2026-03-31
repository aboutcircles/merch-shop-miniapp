import "server-only";

import type { PurchaseSnapshot, RuntimeTrackedPurchase } from "@/types";

const TRACKED_PURCHASE_CACHE_TTL_MS = 3_000;
const SNAPSHOT_CACHE_TTL_MS = 3_000;

type PurchaseCacheState = {
  snapshots: Map<string, { purchaseId: string; value: PurchaseSnapshot; expiresAt: number }>;
  trackedPurchases: Map<string, { value: RuntimeTrackedPurchase; expiresAt: number }>;
};

declare global {
  var __ethccBoothPurchaseCache: PurchaseCacheState | undefined;
}

function getCacheState(): PurchaseCacheState {
  if (!globalThis.__ethccBoothPurchaseCache) {
    globalThis.__ethccBoothPurchaseCache = {
      snapshots: new Map(),
      trackedPurchases: new Map(),
    };
  }

  return globalThis.__ethccBoothPurchaseCache;
}

function isExpired(expiresAt: number) {
  return expiresAt <= Date.now();
}

export function getCachedTrackedPurchase(purchaseId: string) {
  const cache = getCacheState();
  const cached = cache.trackedPurchases.get(purchaseId);

  if (!cached) {
    return undefined;
  }

  if (isExpired(cached.expiresAt)) {
    cache.trackedPurchases.delete(purchaseId);
    return undefined;
  }

  return cached.value;
}

export function setCachedTrackedPurchase(purchase: RuntimeTrackedPurchase) {
  getCacheState().trackedPurchases.set(purchase.purchaseId, {
    value: purchase,
    expiresAt: Date.now() + TRACKED_PURCHASE_CACHE_TTL_MS,
  });
}

export function getCachedSnapshot(key: string) {
  const cache = getCacheState();
  const cached = cache.snapshots.get(key);

  if (!cached) {
    return undefined;
  }

  if (isExpired(cached.expiresAt)) {
    cache.snapshots.delete(key);
    return undefined;
  }

  return cached.value;
}

export function setCachedSnapshot(key: string, purchaseId: string, snapshot: PurchaseSnapshot) {
  getCacheState().snapshots.set(key, {
    purchaseId,
    value: snapshot,
    expiresAt: Date.now() + SNAPSHOT_CACHE_TTL_MS,
  });
}

export function invalidatePurchaseCaches(purchaseId: string) {
  const cache = getCacheState();
  cache.trackedPurchases.delete(purchaseId);

  for (const [key, value] of cache.snapshots.entries()) {
    if (value.purchaseId === purchaseId) {
      cache.snapshots.delete(key);
    }
  }
}
