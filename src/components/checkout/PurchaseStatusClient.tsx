"use client";

import { useEffect, useState } from "react";

import type { MerchItem, PurchaseSnapshot } from "@/types";
import { PaymentQrCard } from "@/components/checkout/PaymentQrCard";

function isTerminalSnapshot(snapshot: PurchaseSnapshot) {
  return (
    snapshot.paymentStatus === "expired" ||
    snapshot.paymentStatus === "failed" ||
    snapshot.paymentStatus === "cancelled" ||
    snapshot.outcomeStatus === "lost" ||
    snapshot.payoutStatus === "refunded"
  );
}

export function PurchaseStatusClient({
  purchaseId,
  ticket,
  initialSnapshot,
  purchasedItem,
  developerPageUrl,
}: {
  purchaseId: string;
  ticket: string;
  initialSnapshot: PurchaseSnapshot;
  purchasedItem: Pick<MerchItem, "image" | "name"> | null;
  developerPageUrl: string;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [manuallyPaid, setManuallyPaid] = useState(false);
  // `manuallyPaid` is treated as terminal so the SSE stream tears down and never
  // reconnects — otherwise the next server event would overwrite the locally
  // confirmed "paid" snapshot back to "awaiting_payment".
  const terminal = manuallyPaid || isTerminalSnapshot(snapshot);

  function markPaidLocally() {
    setManuallyPaid(true);
    setSnapshot((current) => ({ ...current, paymentStatus: "paid" }));
    setError(null);
  }

  useEffect(() => {
    if (terminal) {
      return;
    }

    let closed = false;
    const params = new URLSearchParams({ ticket });
    const source = new EventSource(`/api/purchase/${purchaseId}/events?${params.toString()}`);

    source.onopen = () => {
      if (closed) {
        return;
      }

      setError(null);
    };

    source.onmessage = (event) => {
      if (closed) {
        return;
      }

      try {
        const nextSnapshot = JSON.parse(event.data) as PurchaseSnapshot;

        if (nextSnapshot.purchaseId === purchaseId) {
          setSnapshot(nextSnapshot);
          setError(null);
        }
      } catch {
        setError("Unable to read purchase status update.");
      }
    };

    source.onerror = () => {
      if (closed) {
        return;
      }

      setError("Live payment updates disconnected. Reconnecting...");
    };

    return () => {
      closed = true;
      source.close();
    };
  }, [purchaseId, terminal, ticket]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center gap-6 px-4 py-6 md:px-8 md:py-8">
      {error ? (
        <div className="rounded-[20px] bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error-ink)]">
          {error}
        </div>
      ) : null}

      <PaymentQrCard
        snapshot={snapshot}
        pending={false}
        purchasedItem={purchasedItem}
        developerPageUrl={developerPageUrl}
        onMarkPaid={markPaidLocally}
      />
    </div>
  );
}
