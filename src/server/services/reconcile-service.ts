import "server-only";

import { parsePurchaseTicket } from "@/lib/circles/payment";
import { getOrgBalanceCrc, getOrgTransferDataEvents } from "@/lib/circles/public";
import { listActiveTrackedPurchases, listTrackedPurchases } from "@/lib/idempotency";
import { verifyAndProcessPurchase } from "@/server/services/payment-service";

export async function reconcilePurchases(tickets?: string[]) {
  const trackedPurchases = tickets?.length ? await listTrackedPurchases() : await listActiveTrackedPurchases();
  const trackedById = new Map(trackedPurchases.map((purchase) => [purchase.purchaseId, purchase]));
  const candidateTickets = tickets?.length ? tickets : trackedPurchases.map((purchase) => purchase.ticket);
  const candidates = candidateTickets.map((ticket) => {
    const payload = parsePurchaseTicket(ticket);
    return {
      ticket,
      trackedPurchase: trackedById.get(payload.purchaseId),
    };
  });
  const [transferEvents, balanceCrc] = await Promise.all([
    getOrgTransferDataEvents(250),
    getOrgBalanceCrc(),
  ]);

  const snapshots = await Promise.all(
    candidates.map(async ({ ticket, trackedPurchase }) => {
      try {
        return await verifyAndProcessPurchase(ticket, undefined, {
          balanceCrc,
          trackedPurchase,
          transferEvents,
        });
      } catch {
        return null;
      }
    }),
  );

  return snapshots.filter(Boolean);
}
