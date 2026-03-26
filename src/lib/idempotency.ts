import { getSupabaseClient } from "@/lib/supabase";
import type { PurchaseIntent, RuntimePayoutRecord, RuntimeTrackedPurchase } from "@/types";

type AppRuntimeState = {
  locks: Map<string, Promise<unknown>>;
};

declare global {
  var __ethccBoothRuntime: AppRuntimeState | undefined;
}

const PAYOUT_PROCESSING_STALE_MS = 5 * 60 * 1000;

type PayoutRecordRow = {
  purchase_id: string;
  status: RuntimePayoutRecord["status"];
  tx_hash: string | null;
  error_message: string | null;
  updated_at: string;
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
    },
    { onConflict: "purchase_id" },
  );

  if (error) {
    throw new Error(`Unable to persist purchase: ${error.message}`);
  }
}

export async function listTrackedPurchases() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("purchases")
    .select("purchase_id, reference, merch_item_id, merch_name, ticket, created_at, expires_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to load purchases: ${error.message}`);
  }

  return (data ?? []).map(
    (row): RuntimeTrackedPurchase => ({
      purchaseId: row.purchase_id,
      reference: row.reference,
      merchItemId: row.merch_item_id,
      merchName: row.merch_name,
      ticket: row.ticket,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }),
  );
}

export async function markPurchaseCancelled(purchaseId: string) {
  const client = getSupabaseClient();
  const { error } = await client
    .from("purchases")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("purchase_id", purchaseId);

  if (error) {
    throw new Error(`Unable to cancel purchase: ${error.message}`);
  }
}

export async function setPurchasePaymentDetails(input: {
  purchaseId: string;
  payerAddress: string;
  payerDisplayName: string | null;
  paymentTxHash: string;
  paymentDetectedAt: string;
}) {
  const client = getSupabaseClient();
  const { error } = await client
    .from("purchases")
    .update({
      payer_address: input.payerAddress,
      payer_display_name: input.payerDisplayName,
      payment_tx_hash: input.paymentTxHash,
      payment_detected_at: input.paymentDetectedAt,
    })
    .eq("purchase_id", input.purchaseId);

  if (error) {
    throw new Error(`Unable to persist purchase payment details: ${error.message}`);
  }
}

export async function isPurchaseCancelled(purchaseId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("purchases")
    .select("cancelled_at")
    .eq("purchase_id", purchaseId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load purchase state: ${error.message}`);
  }

  return Boolean(data?.cancelled_at);
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
    return {
      claimed: true,
      record: mapPayoutRecord(retryableAttempt.data as PayoutRecordRow),
    };
  }

  const staleBefore = new Date(Date.now() - PAYOUT_PROCESSING_STALE_MS).toISOString();
  const staleAttempt = await client
    .from("payout_records")
    .update(processingRecord)
    .eq("purchase_id", purchaseId)
    .eq("status", "processing")
    .lt("updated_at", staleBefore)
    .select("purchase_id, status, tx_hash, error_message, updated_at")
    .maybeSingle();

  if (staleAttempt.error) {
    throw new Error(`Unable to claim payout state: ${staleAttempt.error.message}`);
  }

  if (staleAttempt.data) {
    return {
      claimed: true,
      record: mapPayoutRecord(staleAttempt.data as PayoutRecordRow),
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
