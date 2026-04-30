import "server-only";

import type { PurchaseSnapshot } from "@/types";

type PurchaseSnapshotSubscriber = (snapshot: PurchaseSnapshot) => void;

type PurchaseEventState = {
  snapshots: Map<string, PurchaseSnapshot>;
  subscribers: Map<string, Set<PurchaseSnapshotSubscriber>>;
};

declare global {
  var __ethccBoothPurchaseEvents: PurchaseEventState | undefined;
}

function getState(): PurchaseEventState {
  if (!globalThis.__ethccBoothPurchaseEvents) {
    globalThis.__ethccBoothPurchaseEvents = {
      snapshots: new Map(),
      subscribers: new Map(),
    };
  }

  return globalThis.__ethccBoothPurchaseEvents;
}

export function publishPurchaseSnapshot(snapshot: PurchaseSnapshot) {
  const state = getState();
  state.snapshots.set(snapshot.purchaseId, snapshot);

  const subscribers = state.subscribers.get(snapshot.purchaseId);

  if (!subscribers) {
    return;
  }

  for (const subscriber of subscribers) {
    subscriber(snapshot);
  }
}

export function getPublishedPurchaseSnapshot(purchaseId: string) {
  return getState().snapshots.get(purchaseId);
}

export function subscribeToPurchaseSnapshots(purchaseId: string, subscriber: PurchaseSnapshotSubscriber) {
  const state = getState();
  const subscribers = state.subscribers.get(purchaseId) ?? new Set<PurchaseSnapshotSubscriber>();

  subscribers.add(subscriber);
  state.subscribers.set(purchaseId, subscribers);

  return () => {
    subscribers.delete(subscriber);

    if (!subscribers.size) {
      state.subscribers.delete(purchaseId);
    }
  };
}
