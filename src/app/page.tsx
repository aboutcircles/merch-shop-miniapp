import Image from "next/image";
import Link from "next/link";

import { StorefrontExperience } from "@/components/merch/StorefrontExperience";
import { listMerchItems } from "@/lib/merch-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const merchItems = await listMerchItems();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 md:px-8 md:py-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-white/80 p-2 shadow-[0_10px_30px_rgba(5,6,26,0.06)]">
            <Image src="/circles-logo.svg" alt="Circles logo" width={44} height={44} priority />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Circles</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--ink)] md:text-4xl">
              Gnosis Merch Shop
            </h1>
          </div>
        </div>

        <Link
          href="/developers"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--ink)] shadow-[0_10px_30px_rgba(5,6,26,0.06)] transition-transform duration-200 ease-out hover:-translate-y-0.5"
        >
          Learn how to build Circles MiniApps like this
        </Link>
      </header>

      <StorefrontExperience items={merchItems.filter((item) => item.isActive)} />
    </main>
  );
}
