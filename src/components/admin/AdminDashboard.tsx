"use client";

import { useCallback, useEffect, useState } from "react";

import type { MerchItem, PurchaseSnapshot } from "@/types";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/status/StatusBadge";
import { formatCrc, formatDateTime, shortenAddress } from "@/lib/utils";

type AdminResponse = {
  purchases: PurchaseSnapshot[];
  summary: {
    orgBalanceCrc: string | null;
    freeMerchGiven: number;
  };
  error?: string;
};

type AdminMerchResponse = {
  items: MerchItem[];
  error?: string;
};

export function AdminDashboard() {
  const [purchases, setPurchases] = useState<PurchaseSnapshot[]>([]);
  const [merchItems, setMerchItems] = useState<MerchItem[]>([]);
  const [pricingDrafts, setPricingDrafts] = useState<Record<string, { minPriceCrc: string; priceCrc: string; maxPriceCrc: string }>>({});
  const [summary, setSummary] = useState<AdminResponse["summary"]>({
    orgBalanceCrc: null,
    freeMerchGiven: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingMerchId, setSavingMerchId] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);

  const loadPurchases = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/purchases", { cache: "no-store" });
      const data = (await response.json()) as AdminResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to load purchases.");
      }

      setPurchases(data.purchases);
      setSummary(data.summary);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load purchases.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMerchItems = useCallback(async () => {
    const response = await fetch("/api/admin/merch", { cache: "no-store" });
    const data = (await response.json()) as AdminMerchResponse;

    if (!response.ok) {
      throw new Error(data.error ?? "Unable to load merch pricing.");
    }

    setMerchItems(data.items);
    setPricingDrafts((current) => {
      const next = { ...current };

      for (const item of data.items) {
        if (!next[item.id]) {
          next[item.id] = {
            minPriceCrc: item.minPriceCrc,
            priceCrc: item.priceCrc,
            maxPriceCrc: item.maxPriceCrc,
          };
        }
      }

      return next;
    });
  }, []);

  useEffect(() => {
    void loadPurchases();
    void loadMerchItems();
    const interval = window.setInterval(() => {
      void loadPurchases();
    }, 8000);

    return () => window.clearInterval(interval);
  }, [loadMerchItems, loadPurchases]);

  async function handleSavePricing(itemId: string) {
    const draft = pricingDrafts[itemId];

    if (!draft) {
      return;
    }

    setSavingMerchId(itemId);

    try {
      const response = await fetch("/api/admin/merch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: itemId,
          minPriceCrc: draft.minPriceCrc,
          priceCrc: draft.priceCrc,
          maxPriceCrc: draft.maxPriceCrc,
        }),
      });
      const data = (await response.json()) as AdminMerchResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update merch pricing.");
      }

      setMerchItems(data.items);
      setPricingDrafts(
        Object.fromEntries(
          data.items.map((item) => [
            item.id,
            {
              minPriceCrc: item.minPriceCrc,
              priceCrc: item.priceCrc,
              maxPriceCrc: item.maxPriceCrc,
            },
          ]),
        ),
      );
      setError(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update merch pricing.");
    } finally {
      setSavingMerchId(null);
    }
  }

  function updateDraft(itemId: string, field: "minPriceCrc" | "priceCrc" | "maxPriceCrc", value: string) {
    setPricingDrafts((current) => ({
      ...current,
      [itemId]: {
        minPriceCrc: current[itemId]?.minPriceCrc ?? "",
        priceCrc: current[itemId]?.priceCrc ?? "",
        maxPriceCrc: current[itemId]?.maxPriceCrc ?? "",
        [field]: value,
      },
    }));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Admin
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--ink)]">Live purchase monitor</h1>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            void loadPurchases();
            void loadMerchItems();
          }}
        >
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-[20px] bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error-ink)]">
          {error}
        </div>
      ) : null}

      {loading && purchases.length === 0 ? (
        <Panel className="p-8 text-sm text-[var(--muted)]">Loading purchase stream...</Panel>
      ) : null}

      {!loading && purchases.length === 0 ? (
        <Panel className="p-8 text-sm text-[var(--muted)]">
          No purchases have been created since this app instance started.
        </Panel>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="space-y-2 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Org balance</p>
          <p className="text-3xl font-semibold text-[var(--ink)]">
            {summary.orgBalanceCrc ? `${formatCrc(summary.orgBalanceCrc)} CRC` : "Unavailable"}
          </p>
        </Panel>
        <Panel className="space-y-2 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Free merch given</p>
          <p className="text-3xl font-semibold text-[var(--ink)]">{summary.freeMerchGiven}</p>
        </Panel>
      </div>

      <Panel className="overflow-hidden p-0">
        <button
          type="button"
          className="flex w-full items-center justify-between px-5 py-4 text-left"
          onClick={() => setPricingOpen((current) => !current)}
        >
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Merch pricing</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Open to edit item price ranges.</p>
          </div>
          <span
            className={`text-2xl leading-none text-[var(--accent)] transition-transform ${pricingOpen ? "rotate-45" : ""}`}
            aria-hidden="true"
          >
            +
          </span>
        </button>

        {pricingOpen ? (
          <div className="border-t border-[var(--line)]">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left">
                <thead className="bg-[rgba(250,245,241,0.92)]">
                  <tr className="border-b border-[var(--line)]">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Item</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Min CRC</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Default CRC</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Max CRC</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {merchItems.map((item) => {
                    const draft = pricingDrafts[item.id] ?? {
                      minPriceCrc: item.minPriceCrc,
                      priceCrc: item.priceCrc,
                      maxPriceCrc: item.maxPriceCrc,
                    };

                    return (
                      <tr key={item.id} className="border-b border-[var(--line)] last:border-b-0">
                        <td className="px-4 py-4 text-sm font-medium text-[var(--ink)]">{item.name}</td>
                        <td className="px-4 py-4">
                          <input
                            type="number"
                            min="0.01"
                            step="0.1"
                            value={draft.minPriceCrc}
                            onChange={(event) => updateDraft(item.id, "minPriceCrc", event.target.value)}
                            className="h-11 w-24 rounded-[14px] border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <input
                            type="number"
                            min="0.01"
                            step="0.1"
                            value={draft.priceCrc}
                            onChange={(event) => updateDraft(item.id, "priceCrc", event.target.value)}
                            className="h-11 w-24 rounded-[14px] border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <input
                            type="number"
                            min="0.01"
                            step="0.1"
                            value={draft.maxPriceCrc}
                            onChange={(event) => updateDraft(item.id, "maxPriceCrc", event.target.value)}
                            className="h-11 w-24 rounded-[14px] border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <Button
                            variant="secondary"
                            className="h-11 px-4 text-sm"
                            disabled={savingMerchId === item.id}
                            onClick={() => void handleSavePricing(item.id)}
                          >
                            {savingMerchId === item.id ? "Saving..." : "Save"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className="bg-[rgba(250,245,241,0.92)]">
              <tr className="border-b border-[var(--line)]">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Reference</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Item</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Amount</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Status</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Outcome</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Payer</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Created</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Payment tx</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Refund</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => {
                const tone =
                  purchase.payoutStatus === "refunded"
                    ? "success"
                    : purchase.paymentStatus === "cancelled"
                      ? "warn"
                      : purchase.paymentStatus === "paid"
                        ? "accent"
                        : purchase.paymentStatus === "expired"
                          ? "warn"
                          : "neutral";

                return (
                  <tr key={purchase.purchaseId} className="border-b border-[var(--line)] align-top last:border-b-0">
                    <td className="px-4 py-4 text-xs text-[var(--ink)]">{purchase.reference}</td>
                    <td className="px-4 py-4 text-sm font-medium text-[var(--ink)]">{purchase.merchName}</td>
                    <td className="px-4 py-4 text-sm text-[var(--ink)]">{purchase.expectedAmountCrc} CRC</td>
                    <td className="px-4 py-4"><StatusBadge tone={tone}>{purchase.paymentStatus}</StatusBadge></td>
                    <td className="px-4 py-4 text-sm text-[var(--muted)]">{purchase.outcomeStatus}</td>
                    <td className="px-4 py-4 text-sm font-medium text-[var(--ink)]">
                      {purchase.payerAddress
                        ? purchase.payerDisplayName ?? "Unnamed Circles user"
                        : "Pending"}
                    </td>
                    <td className="px-4 py-4 text-sm text-[var(--muted)]">{formatDateTime(purchase.createdAt)}</td>
                    <td className="px-4 py-4 text-xs text-[var(--muted)]">
                      {purchase.paymentTxHash ? shortenAddress(purchase.paymentTxHash, 6) : "Pending"}
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-[var(--muted)]">{purchase.payoutStatus}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
