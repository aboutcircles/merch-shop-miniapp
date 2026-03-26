import type { PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

export function Panel({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("card", className)}>{children}</div>;
}
