import "server-only";

import crypto from "node:crypto";

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBytes = Buffer.from(a, "utf8");
  const bBytes = Buffer.from(b, "utf8");
  const maxLength = Math.max(aBytes.length, bBytes.length, 1);
  const aPadded = Buffer.alloc(maxLength);
  const bPadded = Buffer.alloc(maxLength);
  aBytes.copy(aPadded);
  bBytes.copy(bPadded);
  const equal = crypto.timingSafeEqual(aPadded, bPadded);
  return equal && aBytes.length === bBytes.length;
}
