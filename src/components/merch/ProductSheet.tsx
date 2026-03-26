"use client";

import Image from "next/image";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { MerchItem, PurchaseIntent } from "@/types";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { clamp } from "@/lib/utils";

export function ProductSheet({
  item,
  onClose,
}: {
  item: MerchItem | null;
  onClose: () => void;
}) {
  if (!item) {
    return null;
  }

  return <ProductSheetInner item={item} onClose={onClose} />;
}

function ProductSheetInner({
  item,
  onClose,
}: {
  item: MerchItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [draggingPointerId, setDraggingPointerId] = useState<number | null>(null);

  const currentItem = item;
  const min = Number(currentItem.minPriceCrc);
  const max = Number(currentItem.maxPriceCrc);
  const defaultSliderValue = Math.round(((Number(currentItem.priceCrc) - min) / (max - min || 1)) * 100);
  const [sliderValue, setSliderValue] = useState(defaultSliderValue);

  useEffect(() => {
    setSliderValue(clamp(defaultSliderValue, 0, 100));
    setError(null);
    setLoading(false);
  }, [defaultSliderValue, currentItem.id]);

  const selectedAmount = useMemo(() => {
    const amount = min + (sliderValue / 100) * (max - min);
    const rounded = Math.round(amount * 100) / 100;
    return rounded.toFixed(2).replace(/\.00$/, "");
  }, [max, min, sliderValue]);

  const refundChancePercent = useMemo(() => {
    const ratio = clamp(sliderValue / 100, 0, 1);
    return Math.round(15 + ratio * 70);
  }, [sliderValue]);

  const payChancePercent = 100 - refundChancePercent;

  const updateSliderFromClientX = useCallback((clientX: number) => {
    const sliderElement = sliderRef.current;
    if (!sliderElement) {
      return;
    }

    const rect = sliderElement.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    setSliderValue(Math.round(ratio * 100));
  }, []);

  function handleSliderPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    updateSliderFromClientX(event.clientX);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingPointerId(event.pointerId);
  }

  function handleSliderPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (draggingPointerId !== event.pointerId) {
      return;
    }

    updateSliderFromClientX(event.clientX);
  }

  function handleSliderPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (draggingPointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDraggingPointerId(null);
  }

  function handleSliderKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        setSliderValue((current) => clamp(current - 1, 0, 100));
        return;
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        setSliderValue((current) => clamp(current + 1, 0, 100));
        return;
      case "PageDown":
        event.preventDefault();
        setSliderValue((current) => clamp(current - 10, 0, 100));
        return;
      case "PageUp":
        event.preventDefault();
        setSliderValue((current) => clamp(current + 10, 0, 100));
        return;
      case "Home":
        event.preventDefault();
        setSliderValue(0);
        return;
      case "End":
        event.preventDefault();
        setSliderValue(100);
        return;
      default:
        return;
    }
  }

  async function handlePurchase() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchItemId: currentItem.id,
          selectedAmountCrc: selectedAmount,
        }),
      });

      const data = (await response.json()) as { error?: string; purchase?: PurchaseIntent };

      if (!response.ok || !data.purchase) {
        throw new Error(data.error ?? "Unable to create checkout.");
      }

      const purchase = data.purchase;

      startTransition(() => {
        router.push(`/purchase/${purchase.purchaseId}?ticket=${encodeURIComponent(purchase.ticket)}`);
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create checkout.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-[rgba(5,6,26,0.26)] px-4 py-6 backdrop-blur-[2px] md:px-8 md:py-8">
      <div className="mx-auto flex h-full max-w-7xl items-end md:items-center">
        <Panel className="grid max-h-full w-full overflow-auto gap-6 p-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:p-6">
          <div className="relative min-h-80 overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_top,rgba(234,232,255,0.86),rgba(255,255,255,0.82)_55%,rgba(250,245,241,0.85))]">
            <Image
              src={item.image}
              alt={item.name}
              fill
              className="object-contain p-6 md:p-8"
              sizes="(max-width: 1024px) 100vw, 45vw"
            />
          </div>
          <div className="flex flex-col gap-6 p-2 lg:px-4 lg:py-2">
            <div className="space-y-3 text-center lg:pt-2">
              <p className="text-2xl leading-tight text-[var(--ink)] md:text-3xl">
                {currentItem.name}
              </p>
            </div>

            <div className="space-y-5">
              <div className="px-1 text-center">
                <p className="text-3xl leading-[0.95] text-[var(--ink)] md:text-4xl xl:text-[3.25rem]">
                  Choose your own price.
                </p>
                <p className="mx-auto mt-3 max-w-[32rem] text-base leading-tight text-[var(--muted)] md:text-lg">
                  The higher your price, the higher your odds of getting it free.
                </p>
                <p className="mt-5 text-4xl leading-none tabular-nums text-[var(--ink)] md:text-5xl">
                  {selectedAmount} CRC
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-[11.5rem_minmax(0,1fr)_11.5rem] lg:items-end xl:grid-cols-[12.5rem_minmax(0,1fr)_12.5rem]">
                <div className="space-y-2 lg:text-left">
                  <p className="text-sm font-medium text-[var(--ink)]">Chance its Free</p>
                  <div>
                    <div className="inline-flex items-center gap-3">
                    <span className="min-w-[6.5rem] rounded-[8px] border border-[rgba(254,85,17,0.14)] bg-[var(--orange-100)] px-4 py-2 text-center text-3xl tabular-nums text-[var(--ink)] md:text-4xl">
                      {refundChancePercent}%
                    </span>
                    <span className="text-3xl leading-none md:text-4xl">FREE</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="space-y-4">
                    <div
                      ref={sliderRef}
                      role="slider"
                      tabIndex={0}
                      aria-label="Choose CRC amount"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={sliderValue}
                      aria-valuetext={`${selectedAmount} CRC`}
                      onKeyDown={handleSliderKeyDown}
                      onPointerDown={handleSliderPointerDown}
                      onPointerMove={handleSliderPointerMove}
                      onPointerUp={handleSliderPointerEnd}
                      onPointerCancel={handleSliderPointerEnd}
                      className="relative h-14 touch-none select-none rounded-full outline-none ring-0 transition focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-transparent"
                    >
                      <div className="absolute inset-x-0 top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--line-soft)] shadow-[inset_0_1px_2px_rgba(5,6,26,0.05)]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${sliderValue}%`,
                            background:
                              "linear-gradient(90deg, var(--orange-500) 0%, var(--orange-400) 18%, var(--accent-mid) 58%, var(--accent) 100%)",
                          }}
                        />
                      </div>
                      <div
                        className={`absolute top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-[linear-gradient(180deg,#ffffff,rgba(234,232,255,0.95))] shadow-[0_12px_28px_rgba(67,53,223,0.2),inset_0_1px_0_#fff] ${draggingPointerId === null ? "cursor-grab" : "cursor-grabbing"}`}
                        aria-hidden="true"
                        style={{ left: `${sliderValue}%` }}
                      />
                    </div>

                  <div className="flex items-center justify-between gap-4 text-sm text-[var(--muted)]">
                    <span>{currentItem.minPriceCrc} CRC</span>
                    <span>{currentItem.maxPriceCrc} CRC</span>
                  </div>
                  </div>
                </div>

                <div className="space-y-2 lg:text-right">
                  <p className="text-sm font-medium text-[var(--ink)]">Chance you Pay</p>
                  <div className="inline-flex items-center justify-end gap-3">
                  <span className="min-w-[6.5rem] rounded-[8px] border border-[var(--line)] bg-[rgba(255,255,255,0.92)] px-4 py-2 text-center text-3xl tabular-nums text-[var(--ink)] md:text-4xl">
                    {payChancePercent}%
                  </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[var(--ink)]">
              <span className="h-4 w-4 bg-[var(--ink)]" />
              <span className="text-2xl">{currentItem.name}</span>
            </div>

            {error ? (
              <div className="rounded-[20px] bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error-ink)]">
                {error}
              </div>
            ) : null}

            <div className="mt-auto flex flex-col gap-3 sm:flex-row">
              <Button block className="h-14 text-base" disabled={loading} onClick={handlePurchase}>
                {loading ? "Creating checkout..." : "Continue to Payment"}
              </Button>
              <Button block variant="secondary" className="h-14 text-base" onClick={onClose}>
                Back
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
