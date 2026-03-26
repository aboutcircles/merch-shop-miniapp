import "server-only";

import { listTrackedPurchases } from "@/lib/idempotency";
import { verifyAndProcessPurchase } from "@/server/services/payment-service";

export async function reconcilePurchases(tickets?: string[]) {
  const candidateTickets = tickets?.length
    ? tickets
    : (await listTrackedPurchases()).map((purchase) => purchase.ticket);

  const snapshots = await Promise.all(
    candidateTickets.map(async (ticket) => {
      try {
        return await verifyAndProcessPurchase(ticket);
      } catch {
        return null;
      }
    }),
  );

  return snapshots.filter(Boolean);
}
