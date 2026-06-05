import "server-only";

import { parsePurchaseTicket } from "@/lib/circles/payment";
import {
  type CirclesTransferDataEvent,
  getOrgBalanceCrc,
  getOrgTransferDataEvents,
  getTransactionInput,
} from "@/lib/circles/public";
import { calldataContainsReference, encodePaymentReferenceTransferData } from "@/lib/circles/transfer-data";
import { listActiveTrackedPurchases, listTrackedPurchases } from "@/lib/idempotency";
import { verifyAndProcessPurchase } from "@/server/services/payment-service";
import type { PurchaseTicketPayload, RuntimeTrackedPurchase } from "@/types";

function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

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

export type TransactionTransfer = {
  transactionHash: string;
  from: string;
  to: string;
  timestamp?: string;
  blockNumber?: string;
  transactionIndex?: string;
  logIndex?: string;
};

// Fast path: confirm a payment straight from the transaction calldata, without
// waiting for the indexer to expose the CrcV2_TransferData event. Given a raw
// transfer to the org (from the WSS subscription), we decode the payment
// reference from the transaction input and run the same verification + payout
// pipeline as reconcilePurchases by injecting a synthetic transfer event. If no
// active purchase matches, the indexer-based reconcile remains the fallback.
export async function reconcileTransaction(transfer: TransactionTransfer) {
  // Without a real from/to the synthetic event would verify a zero amount and
  // wrongly mark the purchase failed, so bail and let the indexer burst handle it.
  if (!transfer.transactionHash || !transfer.from || !transfer.to) {
    return [];
  }

  const calldata = await getTransactionInput(transfer.transactionHash);

  if (!calldata) {
    return [];
  }

  const trackedPurchases = await listActiveTrackedPurchases();
  const matches = trackedPurchases
    .map((trackedPurchase) => {
      try {
        return { trackedPurchase, payload: parsePurchaseTicket(trackedPurchase.ticket) };
      } catch {
        return null;
      }
    })
    .filter(
      (entry): entry is { trackedPurchase: RuntimeTrackedPurchase; payload: PurchaseTicketPayload } =>
        entry !== null &&
        normalizeAddress(entry.payload.receivingAddress) === normalizeAddress(transfer.to) &&
        calldataContainsReference(calldata, entry.payload.reference),
    );

  if (!matches.length) {
    return [];
  }

  const balanceCrc = await getOrgBalanceCrc();

  const snapshots = await Promise.all(
    matches.map(async ({ trackedPurchase, payload }) => {
      try {
        const syntheticEvent: CirclesTransferDataEvent = {
          transactionHash: transfer.transactionHash,
          from: transfer.from,
          to: transfer.to,
          data: encodePaymentReferenceTransferData(payload.reference),
          timestamp: transfer.timestamp ?? "",
          blockNumber: transfer.blockNumber ?? "",
          transactionIndex: transfer.transactionIndex ?? "",
          logIndex: transfer.logIndex ?? "",
        };

        return await verifyAndProcessPurchase(trackedPurchase.ticket, undefined, {
          balanceCrc,
          trackedPurchase,
          transferEvents: [syntheticEvent],
        });
      } catch {
        return null;
      }
    }),
  );

  return snapshots.filter(Boolean);
}
