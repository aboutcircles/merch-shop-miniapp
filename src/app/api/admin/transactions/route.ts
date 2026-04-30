import { NextResponse } from "next/server";

import { parsePurchaseTicket } from "@/lib/circles/payment";
import { listTrackedPurchases } from "@/lib/idempotency";
import { adminTransactionsQuerySchema } from "@/lib/validation";
import type {
  AdminTransactionSnapshot,
  AdminTransactionStatus,
  RuntimeTrackedPurchase,
} from "@/types";

function getPaymentStatus(purchase: RuntimeTrackedPurchase): AdminTransactionStatus {
  if (purchase.paymentStatus === "paid") {
    return "confirmed";
  }

  if (
    purchase.paymentStatus === "cancelled" ||
    purchase.paymentStatus === "expired" ||
    purchase.paymentStatus === "failed"
  ) {
    return "failed";
  }

  return "pending";
}

function getRefundStatus(purchase: RuntimeTrackedPurchase): AdminTransactionStatus {
  if (purchase.payoutStatus === "refunded") {
    return "confirmed";
  }

  if (purchase.payoutStatus === "failed" || purchase.payoutStatus === "needs_review") {
    return "failed";
  }

  return "pending";
}

function matchesSearch(transaction: AdminTransactionSnapshot, search: string) {
  const normalized = search.toLowerCase();

  return [
    transaction.reference,
    transaction.purchaseId,
    transaction.merchName,
    transaction.txHash,
    transaction.actorAddress,
    transaction.actorDisplayName,
  ]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(normalized));
}

function buildTransactions(purchases: RuntimeTrackedPurchase[]) {
  const transactions: AdminTransactionSnapshot[] = [];

  for (const purchase of purchases) {
    let ticket;

    try {
      ticket = parsePurchaseTicket(purchase.ticket);
    } catch {
      continue;
    }

    const paymentAmount = purchase.verifiedAmountCrc ?? ticket.expectedAmountCrc;

    transactions.push({
      id: `${purchase.purchaseId}:payment`,
      kind: "payment",
      status: getPaymentStatus(purchase),
      purchaseId: purchase.purchaseId,
      reference: purchase.reference,
      merchName: purchase.merchName,
      amountCrc: paymentAmount,
      txHash: purchase.paymentTxHash,
      actorAddress: purchase.payerAddress,
      actorDisplayName: purchase.payerDisplayName,
      createdAt: purchase.createdAt,
      detectedAt: purchase.paymentDetectedAt,
      statusMessage: purchase.statusMessage,
    });

    if (purchase.outcomeStatus === "won" || purchase.payoutStatus !== "none") {
      transactions.push({
        id: `${purchase.purchaseId}:refund`,
        kind: "refund",
        status: getRefundStatus(purchase),
        purchaseId: purchase.purchaseId,
        reference: purchase.reference,
        merchName: purchase.merchName,
        amountCrc: paymentAmount,
        txHash: purchase.payoutTxHash,
        actorAddress: purchase.payerAddress,
        actorDisplayName: purchase.payerDisplayName,
        createdAt: purchase.paymentDetectedAt ?? purchase.createdAt,
        detectedAt: purchase.payoutStatus === "refunded" ? purchase.lastVerifiedAt : null,
        statusMessage: purchase.statusMessage,
      });
    }
  }

  return transactions.sort((a, b) => {
    const aTime = new Date(a.detectedAt ?? a.createdAt).getTime();
    const bTime = new Date(b.detectedAt ?? b.createdAt).getTime();
    return bTime - aTime;
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { page, pageSize, kind, status, search } = adminTransactionsQuerySchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
      kind: url.searchParams.get("kind") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
    });
    const purchases = await listTrackedPurchases();
    const filtered = buildTransactions(purchases)
      .filter((transaction) => (kind === "all" ? true : transaction.kind === kind))
      .filter((transaction) => (status === "all" ? true : transaction.status === status))
      .filter((transaction) => (search ? matchesSearch(transaction, search) : true));
    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;

    return NextResponse.json({
      page: safePage,
      pageSize,
      totalCount,
      transactions: filtered.slice(start, start + pageSize),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load transactions.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
