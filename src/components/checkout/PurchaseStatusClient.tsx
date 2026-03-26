"use client";

import { useCallback, useEffect, useState } from "react";

import type { PurchaseSnapshot } from "@/types";
import { PaymentQrCard } from "@/components/checkout/PaymentQrCard";

async function fetchSnapshot(id: string, ticket: string, txHash?: string) {
  const response = await fetch("/api/payment/verify", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ticket,
      txHash,
    }),
  });
  const data = (await response.json()) as PurchaseSnapshot & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Unable to load purchase.");
  }

  if (data.purchaseId !== id) {
    throw new Error("Purchase id mismatch.");
  }

  return data;
}

export function PurchaseStatusClient({
  purchaseId,
  ticket,
  initialSnapshot,
}: {
  purchaseId: string;
  ticket: string;
  initialSnapshot: PurchaseSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSnapshot = useCallback(async (txHash?: string) => {
    setPending(true);
    setError(null);

    try {
      const nextSnapshot = await fetchSnapshot(purchaseId, ticket, txHash);
      setSnapshot(nextSnapshot);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh purchase.");
    } finally {
      setPending(false);
    }
  }, [purchaseId, ticket]);

  useEffect(() => {
    if (
      snapshot.paymentStatus === "expired" ||
      snapshot.paymentStatus === "failed" ||
      snapshot.paymentStatus === "cancelled" ||
      snapshot.outcomeStatus === "lost" ||
      snapshot.payoutStatus === "refunded"
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshSnapshot();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [refreshSnapshot, snapshot]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center gap-6 px-4 py-6 md:px-8 md:py-8">
      {error ? (
        <div className="rounded-[20px] bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error-ink)]">
          {error}
        </div>
      ) : null}

      <PaymentQrCard snapshot={snapshot} pending={pending} />
    </div>
  );
}
