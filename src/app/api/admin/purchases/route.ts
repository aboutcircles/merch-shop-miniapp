import { NextResponse } from "next/server";

import { parsePurchaseTicket } from "@/lib/circles/payment";
import { getOrgBalanceCircles, getOrgBalanceCrc, getOrgTransferDataEvents } from "@/lib/circles/public";
import { buildPurchaseSnapshot } from "@/lib/circles/verify";
import { countFreeMerchGiven, listTrackedPurchasesPage } from "@/lib/idempotency";
import { adminPurchasesQuerySchema } from "@/lib/validation";
import type { PurchaseSnapshot } from "@/types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { page: requestedPage, pageSize } = adminPurchasesQuerySchema.parse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  const { items, totalCount } = await listTrackedPurchasesPage(requestedPage, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const [orgBalanceCircles, orgBalanceCrc, freeMerchGiven, transferEvents] = await Promise.all([
    getOrgBalanceCircles(),
    getOrgBalanceCrc(),
    countFreeMerchGiven(),
    items.length ? getOrgTransferDataEvents(250) : Promise.resolve([]),
  ]);

  const snapshots = await Promise.all(
    items.map(async (purchase) => {
      try {
        return await buildPurchaseSnapshot(parsePurchaseTicket(purchase.ticket), purchase.ticket, undefined, {
          balanceCrc: orgBalanceCrc,
          persistDerivedState: false,
          persistPaymentDetails: false,
          trackedPurchase: purchase,
          transferEvents,
        });
      } catch {
        return null;
      }
    }),
  );
  const purchases = snapshots.filter((purchase): purchase is PurchaseSnapshot => Boolean(purchase));

  return NextResponse.json({
    page,
    pageSize,
    totalCount,
    summary: {
      orgBalanceCircles,
      freeMerchGiven,
    },
    purchases,
  });
}
