"use client";

import { useState } from "react";
import Image from "next/image";

import type { MerchItem } from "@/types";
import { ProductSheet } from "@/components/merch/ProductSheet";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/utils";

export function StorefrontExperience({ items }: { items: MerchItem[] }) {
  const [selectedItem, setSelectedItem] = useState<MerchItem | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const activeItem = items[activeIndex];

  function showPrevious() {
    setActiveIndex((current) => (current === 0 ? items.length - 1 : current - 1));
  }

  function showNext() {
    setActiveIndex((current) => (current === items.length - 1 ? 0 : current + 1));
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel className="relative overflow-hidden p-4 md:p-6">
          <div className="absolute inset-x-6 top-6 z-10 flex items-center justify-between">
            <button
              aria-label="Previous product"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--line)] bg-white/88 text-xl text-[var(--ink)] shadow-[0_12px_30px_rgba(5,6,26,0.08)] transition-transform hover:-translate-y-0.5"
              onClick={showPrevious}
            >
              ←
            </button>
            <button
              aria-label="Next product"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--line)] bg-white/88 text-xl text-[var(--ink)] shadow-[0_12px_30px_rgba(5,6,26,0.08)] transition-transform hover:-translate-y-0.5"
              onClick={showNext}
            >
              →
            </button>
          </div>

          <div className="relative aspect-[4/4.2] overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_top,rgba(234,232,255,0.9),rgba(255,255,255,0.7)_48%,rgba(250,245,241,0.86))]">
            <Image
              key={activeItem.id}
              src={activeItem.image}
              alt={activeItem.name}
              fill
              className="object-contain p-6 md:p-10"
              sizes="(max-width: 1280px) 100vw, 60vw"
              priority
            />
          </div>
        </Panel>

        <Panel className="flex flex-col justify-between gap-6 p-5 md:p-7">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                {activeItem.tag}
              </p>
              <div className="rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm font-semibold text-[var(--accent)]">
                {activeItem.minPriceCrc} - {activeItem.maxPriceCrc} CRC
              </div>
            </div>
            <div>
              <h2 className="text-4xl font-semibold tracking-tight text-[var(--ink)] md:text-5xl">
                {activeItem.name}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {items.map((item, index) => (
              <button
                key={item.id}
                aria-label={`Select ${item.name}`}
                className={cn(
                  "group rounded-[22px] border p-2 transition-all",
                  index === activeIndex
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_10px_30px_rgba(67,53,223,0.14)]"
                    : "border-[var(--line)] bg-white/86 hover:-translate-y-0.5 hover:bg-white",
                )}
                onClick={() => setActiveIndex(index)}
              >
                <div className="relative aspect-square overflow-hidden rounded-[16px] bg-[rgba(250,245,241,0.86)]">
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-contain p-2"
                    sizes="160px"
                  />
                </div>
              </button>
            ))}
          </div>

          <Button block className="h-14 text-base" onClick={() => setSelectedItem(activeItem)}>
            Pay With CRC
          </Button>
        </Panel>
      </div>

      <ProductSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
    </>
  );
}
