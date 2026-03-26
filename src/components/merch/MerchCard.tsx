import Image from "next/image";

import type { MerchItem } from "@/types";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

export function MerchCard({
  item,
  onSelect,
}: {
  item: MerchItem;
  onSelect: (item: MerchItem) => void;
}) {
  return (
    <Panel className="group flex h-full flex-col gap-4 p-4 md:p-5">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[20px] bg-[linear-gradient(180deg,rgba(234,232,255,0.55),rgba(255,255,255,0.72))]">
        <Image
          src={item.image}
          alt={item.name}
          fill
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 45vw, 30vw"
        />
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            {item.tag}
          </p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">{item.name}</h3>
        </div>
        <div className="rounded-full bg-[var(--accent-soft)] px-3 py-2 text-sm font-semibold text-[var(--accent)]">
          {item.minPriceCrc} - {item.maxPriceCrc} CRC
        </div>
      </div>
      <Button block onClick={() => onSelect(item)}>
        Pay With CRC
      </Button>
    </Panel>
  );
}
