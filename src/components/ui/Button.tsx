import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost";
    block?: boolean;
  }
>;

export function Button({
  children,
  className,
  variant = "primary",
  block = false,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-12 items-center justify-center rounded-full px-5 text-sm font-semibold transition-transform duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-50",
        block && "w-full",
        variant === "primary" &&
          "primary-button shadow-[0_16px_36px_rgba(67,53,223,0.24)] hover:-translate-y-0.5",
        variant === "secondary" &&
          "secondary-button hover:-translate-y-0.5 hover:bg-white/90",
        variant === "ghost" && "text-[var(--muted)] hover:bg-white/70",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
