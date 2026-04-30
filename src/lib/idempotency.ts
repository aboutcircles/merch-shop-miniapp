import { getCachedTrackedPurchase, invalidatePurchaseCaches, setCachedTrackedPurchase } from "@/lib/purchase-cache";
import { getSupabaseClient } from "@/lib/supabase";
import type {
  OutcomeStatus,
  PaymentStatus,
  PurchaseIntent,
  RuntimePayoutRecord,
  RuntimeTrackedPurchase,
  VerificationStatus,
} from "@/types";

type AppRuntimeState = {
  locks: Map<string, Promise<unknown>>;
};

declare global {
  var __ethccBoothRuntime: AppRuntimeState | undefined;
}

const PAYOUT_PROCESSING_STALE_MS = 30 * 60 * 1000;
const PURCHASE_SELECT =
  "purchase_id, reference, merch_item_id, merch_name, ticket, created_at, expires_at, cancelled_at, payer_address, payer_display_name, payment_tx_hash, payment_detected_at, payment_status, outcome_status, payout_status, verification_status, verified_amount_crc, verified_amount_atto_crc, payout_tx_hash, status_message, last_verified_at";

type PayoutRecordRow = {
  purchase_id: string;
  status: RuntimePayoutRecord["status"];
  tx_hash: string | null;
  error_message: string | null;
  updated_at: string;
};

type PurchaseRow = {
  purchase_id: string;
  reference: string;
  merch_item_id: string;
  merch_name: string;
  ticket: string;
  created_at: string;
  expires_at: string;
  cancelled_at: string | null;
  payer_address: string | null;
  payer_display_name: string | null;
  payment_tx_hash: string | null;
  payment_detected_at: string | null;
  payment_status: PaymentStatus | null;
  outcome_status: OutcomeStatus | null;
  payout_status: RuntimePayoutRecord["status"] | null;
  verification_status: VerificationStatus | null;
  verified_amount_crc: string | null;
  verified_amount_atto_crc: string | null;
  payout_tx_hash: string | null;
  status_message: string | null;
  last_verified_at: string | null;
};

type PurchaseStatePatch = {
  cancelledAt?: string | null;
  lastVerifiedAt?: string | null;
  outcomeStatus?: OutcomeStatus;
  payerAddress?: string | null;
  payerDisplayName?: string | null;
  paymentDetectedAt?: string | null;
  paymentStatus?: PaymentStatus;
  paymentTxHash?: string | null;
  payoutStatus?: RuntimePayoutRecord["status"];
  payoutTxHash?: string | null;
  statusMessage?: string;
  verificationStatus?: VerificationStatus;
  verifiedAmountAttoCrc?: string | null;
  verifiedAmountCrc?: string | null;
};

function getState(): AppRuntimeState {
  if (!globalThis.__ethccBoothRuntime) {
    globalThis.__ethccBoothRuntime = {
      locks: new Map(),
    };
  }

  return globalThis.__ethccBoothRuntime;
}

function mapPayoutRecord(row: PayoutRecordRow): RuntimePayoutRecord {
  return {
    purchaseId: row.purchase_id,
    status: row.status,
    txHash: row.tx_hash,
    errorMessage: row.error_message,
    updatedAt: row.updated_at,
  };
}

function mapTrackedPurchase(row: PurchaseRow): RuntimeTrackedPurchase {
  return {
    purchaseId: row.purchase_id,
    reference: row.reference,
    merchItemId: row.merch_item_id,
    merchName: row.merch_name,
    ticket: row.ticket,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    cancelledAt: row.cancelled_at,
    payerAddress: row.payer_address,
    payerDisplayName: row.payer_display_name,
    paymentTxHash: row.payment_tx_hash,
    paymentDetectedAt: row.payment_detected_at,
    paymentStatus: row.payment_status ?? "awaiting_payment",
    outcomeStatus: row.outcome_status ?? "pending",
    payoutStatus: row.payout_status ?? "none",
    verificationStatus: row.verification_status ?? "pending",
    verifiedAmountCrc: row.verified_amount_crc,
    verifiedAmountAttoCrc: row.verified_amount_atto_crc,
    payoutTxHash: row.payout_tx_hash,
    statusMessage: row.status_message ?? "Waiting for an incoming CRC transfer.",
    lastVerifiedAt: row.last_verified_at,
  };
}

function isPurchaseActive(purchase: RuntimeTrackedPurchase) {
  return (
    purchase.paymentStatus === "awaiting_payment" ||
    purchase.payoutStatus === "queued" ||
    purchase.payoutStatus === "processing" ||
    purchase.payoutStatus === "failed"
  );
}

async function updatePurchaseState(purchaseId: string, patch: PurchaseStatePatch) {
  if (!Object.keys(patch).length) {
    return;
  }

  const payload: Record<string, string | null> = {};

  if ("cancelledAt" in patch) {
    payload.cancelled_at = patch.cancelledAt ?? null;
  }
  if ("lastVerifiedAt" in patch) {
    payload.last_verified_at = patch.lastVerifiedAt ?? null;
  }
  if ("outcomeStatus" in patch) {
    payload.outcome_status = patch.outcomeStatus ?? null;
  }
  if ("payerAddress" in patch) {
    payload.payer_address = patch.payerAddress ?? null;
  }
  if ("payerDisplayName" in patch) {
    payload.payer_display_name = patch.payerDisplayName ?? null;
  }
  if ("paymentDetectedAt" in patch) {
    payload.payment_detected_at = patch.paymentDetectedAt ?? null;
  }
  if ("paymentStatus" in patch) {
    payload.payment_status = patch.paymentStatus ?? null;
  }
  if ("paymentTxHash" in patch) {
    payload.payment_tx_hash = patch.paymentTxHash ?? null;
  }
  if ("payoutStatus" in patch) {
    payload.payout_status = patch.payoutStatus ?? null;
  }
  if ("payoutTxHash" in patch) {
    payload.payout_tx_hash = patch.payoutTxHash ?? null;
  }
  if ("statusMessage" in patch) {
    payload.status_message = patch.statusMessage ?? null;
  }
  if ("verificationStatus" in patch) {
    payload.verification_status = patch.verificationStatus ?? null;
  }
  if ("verifiedAmountAttoCrc" in patch) {
    payload.verified_amount_atto_crc = patch.verifiedAmountAttoCrc ?? null;
  }
  if ("verifiedAmountCrc" in patch) {
    payload.verified_amount_crc = patch.verifiedAmountCrc ?? null;
  }

  const client = getSupabaseClient();
  const { error } = await client
    .from("purchases")
    .update(payload)
    .eq("purchase_id", purchaseId);

  if (error) {
    throw new Error(`Unable to update purchase state: ${error.message}`);
  }

  invalidatePurchaseCaches(purchaseId);
}

export async function trackPurchase(intent: PurchaseIntent) {
  const client = getSupabaseClient();
  const { error } = await client.from("purchases").upsert(
    {
      purchase_id: intent.purchaseId,
      reference: intent.reference,
      merch_item_id: intent.merchItemId,
      merch_name: intent.merchName,
      ticket: intent.ticket,
      created_at: intent.createdAt,
      expires_at: intent.expiresAt,
      payment_status: "awaiting_payment",
      outcome_status: "pending",
      payout_status: "none",
      verification_status: "pending",
      status_message: "Waiting for an incoming CRC transfer.",
    },
    { onConflict: "purchase_id" },
  );

  if (error) {
    throw new Error(`Unable to persist purchase: ${error.message}`);
  }

  invalidatePurchaseCaches(intent.purchaseId);
}

export async function listTrackedPurchases() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("purchases")
    .select(PURCHASE_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load purchases: ${error.message}`);
  }

  return (data ?? []).map((row) => mapTrackedPurchase(row as PurchaseRow));
}

export async function listTrackedPurchasesPage(page: number, pageSize: number) {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(pageSize, 100));
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize - 1;
  const client = getSupabaseClient();
  const { data, error, count } = await client
    .from("purchases")
    .select(PURCHASE_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(start, end);

  if (error) {
    throw new Error(`Unable to load purchases: ${error.message}`);
  }

  return {
    items: (data ?? []).map((row) => mapTrackedPurchase(row as PurchaseRow)),
    totalCount: count ?? 0,
  };
}

export async function listActiveTrackedPurchases(limit = 200) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("purchases")
    .select(PURCHASE_SELECT)
    .or("payment_status.eq.awaiting_payment,payout_status.in.(queued,processing,failed)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Unable to load active purchases: ${error.message}`);
  }

  return (data ?? []).map((row) => mapTrackedPurchase(row as PurchaseRow)).filter(isPurchaseActive);
}

export async function countFreeMerchGiven() {
  const client = getSupabaseClient();
  const { count, error } = await client
    .from("purchases")
    .select("purchase_id", { count: "exact", head: true })
    .eq("outcome_status", "won");

  if (error) {
    throw new Error(`Unable to count free merch: ${error.message}`);
  }

  return count ?? 0;
}

export async function getTrackedPurchase(purchaseId: string) {
  const cached = getCachedTrackedPurchase(purchaseId);

  if (cached) {
    return cached;
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from("purchases")
    .select(PURCHASE_SELECT)
    .eq("purchase_id", purchaseId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load purchase state: ${error.message}`);
  }

  if (!data) {
    return undefined;
  }

  const purchase = mapTrackedPurchase(data as PurchaseRow);
  setCachedTrackedPurchase(purchase);
  return purchase;
}

export async function markPurchaseCancelled(purchaseId: string) {
  await updatePurchaseState(purchaseId, {
    cancelledAt: new Date().toISOString(),
    paymentStatus: "cancelled",
    statusMessage: "Checkout cancelled.",
  });
}

export async function setPurchasePaymentDetails(input: {
  purchaseId: string;
  payerAddress: string;
  payerDisplayName: string | null;
  paymentTxHash: string;
  paymentDetectedAt: string;
}) {
  await updatePurchaseState(input.purchaseId, {
    payerAddress: input.payerAddress,
    payerDisplayName: input.payerDisplayName,
    paymentDetectedAt: input.paymentDetectedAt,
    paymentTxHash: input.paymentTxHash,
  });
}

export async function setPurchaseDerivedState(
  purchaseId: string,
  patch: Pick<
    PurchaseStatePatch,
    | "cancelledAt"
    | "lastVerifiedAt"
    | "outcomeStatus"
    | "paymentStatus"
    | "payoutStatus"
    | "payoutTxHash"
    | "statusMessage"
    | "verificationStatus"
    | "verifiedAmountAttoCrc"
    | "verifiedAmountCrc"
  >,
) {
  await updatePurchaseState(purchaseId, patch);
}

export async function getPayoutRecord(purchaseId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("payout_records")
    .select("purchase_id, status, tx_hash, error_message, updated_at")
    .eq("purchase_id", purchaseId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load payout state: ${error.message}`);
  }

  if (!data) {
    return undefined;
  }

  return mapPayoutRecord(data as PayoutRecordRow);
}

export async function setPayoutRecord(record: RuntimePayoutRecord) {
  const client = getSupabaseClient();
  const { error } = await client.from("payout_records").upsert(
    {
      purchase_id: record.purchaseId,
      status: record.status,
      tx_hash: record.txHash,
      error_message: record.errorMessage,
      updated_at: record.updatedAt,
    },
    { onConflict: "purchase_id" },
  );

  if (error) {
    throw new Error(`Unable to persist payout state: ${error.message}`);
  }

  await updatePurchaseState(record.purchaseId, {
    lastVerifiedAt: record.updatedAt,
    payoutStatus: record.status,
    payoutTxHash: record.txHash,
    statusMessage:
      record.status === "processing"
        ? "Payment confirmed. Refund transaction is processing."
        : record.status === "refunded"
          ? "Refund confirmed on-chain."
          : record.status === "failed"
            ? "Payment confirmed, but the automatic refund failed and needs a retry."
            : record.status === "needs_review"
              ? "Refund partially completed. Manual review required before retrying."
              : undefined,
  });
}

export async function claimPayoutProcessing(purchaseId: string) {
  const client = getSupabaseClient();
  const updatedAt = new Date().toISOString();
  const processingRecord = {
    purchase_id: purchaseId,
    status: "processing" as const,
    tx_hash: null,
    error_message: null,
    updated_at: updatedAt,
  };

  const insertAttempt = await client
    .from("payout_records")
    .insert(processingRecord)
    .select("purchase_id, status, tx_hash, error_message, updated_at")
    .maybeSingle();

  if (!insertAttempt.error && insertAttempt.data) {
    await updatePurchaseState(purchaseId, {
      lastVerifiedAt: updatedAt,
      payoutStatus: "processing",
      payoutTxHash: null,
      statusMessage: "Payment confirmed. Refund transaction is processing.",
    });

    return {
      claimed: true,
      record: mapPayoutRecord(insertAttempt.data as PayoutRecordRow),
    };
  }

  if (insertAttempt.error && insertAttempt.error.code !== "23505") {
    throw new Error(`Unable to claim payout state: ${insertAttempt.error.message}`);
  }

  const retryableAttempt = await client
    .from("payout_records")
    .update(processingRecord)
    .eq("purchase_id", purchaseId)
    .in("status", ["failed", "queued"])
    .select("purchase_id, status, tx_hash, error_message, updated_at")
    .maybeSingle();

  if (retryableAttempt.error) {
    throw new Error(`Unable to claim payout state: ${retryableAttempt.error.message}`);
  }

  if (retryableAttempt.data) {
    await updatePurchaseState(purchaseId, {
      lastVerifiedAt: updatedAt,
      payoutStatus: "processing",
      payoutTxHash: null,
      statusMessage: "Payment confirmed. Refund transaction is processing.",
    });

    return {
      claimed: true,
      record: mapPayoutRecord(retryableAttempt.data as PayoutRecordRow),
    };
  }

  const staleBefore = new Date(Date.now() - PAYOUT_PROCESSING_STALE_MS).toISOString();
  const staleDemotionRecord = {
    purchase_id: purchaseId,
    status: "needs_review" as const,
    tx_hash: null,
    error_message:
      "Refund was claimed by a worker but never completed within the safety window. On-chain status must be verified manually before retrying.",
    updated_at: updatedAt,
  };
  const staleDemotion = await client
    .from("payout_records")
    .update(staleDemotionRecord)
    .eq("purchase_id", purchaseId)
    .eq("status", "processing")
    .lt("updated_at", staleBefore)
    .select("purchase_id, status, tx_hash, error_message, updated_at")
    .maybeSingle();

  if (staleDemotion.error) {
    throw new Error(`Unable to demote stale payout state: ${staleDemotion.error.message}`);
  }

  if (staleDemotion.data) {
    await updatePurchaseState(purchaseId, {
      lastVerifiedAt: updatedAt,
      payoutStatus: "needs_review",
      payoutTxHash: null,
      statusMessage: "Refund stalled. Manual review required before retrying.",
    });

    return {
      claimed: false,
      record: mapPayoutRecord(staleDemotion.data as PayoutRecordRow),
    };
  }

  const currentRecord = await getPayoutRecord(purchaseId);

  if (!currentRecord) {
    throw new Error("Unable to load payout state after claim attempt.");
  }

  return {
    claimed: false,
    record: currentRecord,
  };
}

export async function archiveCompletedPurchases(beforeIso: string, limit = 200) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("purchases")
    .select(PURCHASE_SELECT)
    .lt("created_at", beforeIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Unable to load archive candidates: ${error.message}`);
  }

  const candidates = (data ?? [])
    .map((row) => mapTrackedPurchase(row as PurchaseRow))
    .filter(
      (purchase) =>
        purchase.paymentStatus === "cancelled" ||
        purchase.paymentStatus === "failed" ||
        (purchase.paymentStatus === "paid" && purchase.outcomeStatus === "lost") ||
        purchase.payoutStatus === "refunded",
    );

  if (!candidates.length) {
    return {
      archivedCount: 0,
      purchaseIds: [] as string[],
    };
  }

  const { error: archiveError } = await client.from("purchase_archives").upsert(
    candidates.map((purchase) => ({
      purchase_id: purchase.purchaseId,
      reference: purchase.reference,
      merch_item_id: purchase.merchItemId,
      merch_name: purchase.merchName,
      ticket: purchase.ticket,
      created_at: purchase.createdAt,
      expires_at: purchase.expiresAt,
      cancelled_at: purchase.cancelledAt,
      payer_address: purchase.payerAddress,
      payer_display_name: purchase.payerDisplayName,
      payment_tx_hash: purchase.paymentTxHash,
      payment_detected_at: purchase.paymentDetectedAt,
      payment_status: purchase.paymentStatus,
      outcome_status: purchase.outcomeStatus,
      payout_status: purchase.payoutStatus,
      verification_status: purchase.verificationStatus,
      verified_amount_crc: purchase.verifiedAmountCrc,
      verified_amount_atto_crc: purchase.verifiedAmountAttoCrc,
      payout_tx_hash: purchase.payoutTxHash,
      status_message: purchase.statusMessage,
      last_verified_at: purchase.lastVerifiedAt,
      archived_at: new Date().toISOString(),
    })),
    { onConflict: "purchase_id" },
  );

  if (archiveError) {
    throw new Error(`Unable to archive purchases: ${archiveError.message}`);
  }

  const purchaseIds = candidates.map((purchase) => purchase.purchaseId);
  const { error: deleteError } = await client.from("purchases").delete().in("purchase_id", purchaseIds);

  if (deleteError) {
    throw new Error(`Unable to delete archived purchases: ${deleteError.message}`);
  }

  for (const purchaseId of purchaseIds) {
    invalidatePurchaseCaches(purchaseId);
  }

  return {
    archivedCount: purchaseIds.length,
    purchaseIds,
  };
}

export async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const state = getState();
  const previous = state.locks.get(key);

  if (previous) {
    await previous;
  }

  let resolveLock: (() => void) | undefined;

  const current = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });

  state.locks.set(key, current);

  try {
    return await fn();
  } finally {
    resolveLock?.();
    if (state.locks.get(key) === current) {
      state.locks.delete(key);
    }
  }
}
