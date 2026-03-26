import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  tone: "neutral" | "success" | "warn" | "error" | "accent";
  children: string;
};

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-[0.08em] uppercase",
        tone === "neutral" && "bg-[var(--line-soft)] text-[var(--muted)]",
        tone === "success" && "bg-[var(--success-bg)] text-[var(--success-ink)]",
        tone === "warn" && "bg-[var(--warn-bg)] text-[var(--warn-ink)]",
        tone === "error" && "bg-[var(--error-bg)] text-[var(--error-ink)]",
        tone === "accent" && "bg-[var(--accent-soft)] text-[var(--accent)]",
      )}
    >
      {children}
    </span>
  );
}
