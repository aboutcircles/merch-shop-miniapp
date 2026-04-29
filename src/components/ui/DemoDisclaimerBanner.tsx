import { cn } from "@/lib/utils";

export function DemoDisclaimerBanner({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-[22px] border border-[rgba(239,58,7,0.28)] bg-[linear-gradient(135deg,rgba(255,236,226,0.98),rgba(255,248,235,0.96))] px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]",
        compact ? "items-start" : "items-start sm:items-center",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--orange-600)] text-sm font-bold text-white sm:mt-0"
      >
        !
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--ink)]">Demo store only</p>
        <p
          className={cn(
            "mt-1 text-sm leading-6 text-[var(--warn-ink)]",
            compact ? "" : "max-w-4xl",
          )}
        >
          No goods will be shipped. This store is a demo of Circles Standalone Mini App.
        </p>
      </div>
    </div>
  );
}
