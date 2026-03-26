import { NextResponse } from "next/server";

import { getOrgBalanceCrc } from "@/lib/circles/public";
import { listTrackedPurchases } from "@/lib/idempotency";
import { getPurchaseSnapshot } from "@/server/services/payment-service";
import type { PurchaseSnapshot } from "@/types";

export async function GET() {
  const tracked = await listTrackedPurchases();
  const snapshots = await Promise.all(
    tracked.map(async (purchase) => {
      try {
        return await getPurchaseSnapshot(purchase.ticket);
      } catch {
        return null;
      }
    }),
  );

  const purchases = snapshots.filter((purchase): purchase is PurchaseSnapshot => Boolean(purchase));
  const orgBalanceCrc = await getOrgBalanceCrc();
  const freeMerchGiven = purchases.filter((purchase) => purchase.outcomeStatus === "won").length;

  return NextResponse.json({
    count: tracked.length,
    summary: {
      orgBalanceCrc,
      freeMerchGiven,
    },
    purchases,
  });
}
