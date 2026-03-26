import "server-only";

import {
  getAvatarDisplayName,
  getOrgBalanceCrc,
  getOrgTransferDataEvents,
  getTransferAmountForTx,
  type CirclesTransferDataEvent,
} from "@/lib/circles/public";
import type { ChainPayment, PurchaseSnapshot, PurchaseTicketPayload, VerificationStatus } from "@/types";
import { getPayoutRecord, isPurchaseCancelled, setPurchasePaymentDetails } from "@/lib/idempotency";
import { resolveAutomatedOutcome } from "@/server/services/outcome-service";

function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

function normalizeString(value: string) {
  return value.trim().toLowerCase();
}

function normalizeHex(value: string): string | null {
  const trimmed = normalizeString(value);

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("\\x")) {
    return `0x${trimmed.slice(2)}`;
  }

  if (trimmed.startsWith("0x")) {
    return trimmed;
  }

  if (/^[0-9a-f]+$/i.test(trimmed)) {
    return `0x${trimmed}`;
  }

  return null;
}

function utf8ToHex(value: string) {
  return Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToUtf8(hexValue: string): string | null {
  try {
    const normalized = hexValue.startsWith("0x") ? hexValue.slice(2) : hexValue;

    if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(normalized)) {
      return null;
    }

    const bytes = new Uint8Array(normalized.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function eventMatchesData(dataField: string, dataValue: string) {
  const target = normalizeString(dataValue);

  if (!target) {
    return false;
  }

  const targetHex = utf8ToHex(target);
  const candidates = new Set<string>([target, targetHex, `0x${targetHex}`]);

  if (target.startsWith("0x")) {
    candidates.add(target.slice(2));
  }

  const eventRaw = normalizeString(dataField);

  if (candidates.has(eventRaw)) {
    return true;
  }

  const eventHex = normalizeHex(eventRaw);

  if (!eventHex) {
    return false;
  }

  if (candidates.has(eventHex) || candidates.has(eventHex.slice(2))) {
    return true;
  }

  const eventUtf8 = hexToUtf8(eventHex);
  return eventUtf8 ? candidates.has(normalizeString(eventUtf8)) : false;
}

function parseTimestamp(value: string) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return new Date().toISOString();
  }

  const millis = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  return new Date(millis).toISOString();
}

function toChainPayment(
  event: CirclesTransferDataEvent,
  verifiedAmount: {
    amountCrc: string;
    amountAttoCrc: string;
  },
): ChainPayment {
  return {
    txHash: event.transactionHash,
    fromAddress: event.from,
    toAddress: event.to,
    tokenAddress: "crc",
    amountCrc: verifiedAmount.amountCrc,
    amountAttoCrc: verifiedAmount.amountAttoCrc,
    timestamp: parseTimestamp(event.timestamp),
  };
}

function findMatchingPayment(
  payload: PurchaseTicketPayload,
  rows: CirclesTransferDataEvent[],
  txHash?: string,
) {
  return rows
    .filter((row) => normalizeAddress(row.to) === normalizeAddress(payload.receivingAddress))
    .filter((row) => (txHash ? row.transactionHash.toLowerCase() === txHash.toLowerCase() : true))
    .find((row) => eventMatchesData(row.data, payload.reference));
}

export async function buildPurchaseSnapshot(
  payload: PurchaseTicketPayload,
  ticket: string,
  txHash?: string,
): Promise<PurchaseSnapshot> {
  const [rows, balanceCrc, runtimePayout, cancelled] = await Promise.all([
    getOrgTransferDataEvents(250),
    getOrgBalanceCrc(),
    getPayoutRecord(payload.purchaseId),
    isPurchaseCancelled(payload.purchaseId),
  ]);
  const paymentRow = findMatchingPayment(payload, rows, txHash);
  const now = Date.now();
  const expired = now > new Date(payload.expiresAt).getTime();
  const autoCancelled = expired && !paymentRow;

  let verificationStatus: VerificationStatus = "pending";
  let paymentStatus: PurchaseSnapshot["paymentStatus"] = cancelled
    ? "cancelled"
    : autoCancelled
      ? "cancelled"
      : "awaiting_payment";
  let outcomeStatus: PurchaseSnapshot["outcomeStatus"] = "pending";
  let payoutStatus: PurchaseSnapshot["payoutStatus"] = runtimePayout?.status ?? "none";
  let verifiedAmountCrc: string | null = null;
  let verifiedAmountAttoCrc: string | null = null;
  let payerAddress: string | null = null;
  let payerDisplayName: string | null = null;
  let paymentTxHash: string | null = null;
  let paymentDetectedAt: string | null = null;
  let payoutTxHash: string | null = runtimePayout?.txHash ?? null;
  let statusMessage = cancelled
    ? "Checkout cancelled."
    : autoCancelled
      ? "Checkout cancelled after 5 minutes without payment."
      : "Waiting for an incoming CRC transfer.";

  if (txHash && !paymentRow) {
    verificationStatus = "invalid";
    paymentStatus = "failed";
    statusMessage = "Submitted transaction does not match this purchase.";
  }

  if (paymentRow) {
    const verifiedTransfer = await getTransferAmountForTx(paymentRow);

    if (!verifiedTransfer) {
      verificationStatus = "invalid";
      paymentStatus = "failed";
      statusMessage = "Matching transfer reference found, but the on-chain amount could not be verified.";
    } else {
      const payment = toChainPayment(paymentRow, verifiedTransfer);
      verifiedAmountCrc = payment.amountCrc;
      verifiedAmountAttoCrc = payment.amountAttoCrc;

      if (payment.amountAttoCrc !== payload.expectedAmountAttoCrc) {
        verificationStatus = "invalid";
        paymentStatus = "failed";
        statusMessage = `Incoming transfer amount (${payment.amountCrc} CRC) does not match the expected amount (${payload.expectedAmountCrc} CRC).`;
      } else {
        payerDisplayName = await getAvatarDisplayName(payment.fromAddress);
        await setPurchasePaymentDetails({
          purchaseId: payload.purchaseId,
          payerAddress: payment.fromAddress,
          payerDisplayName,
          paymentTxHash: payment.txHash,
          paymentDetectedAt: payment.timestamp,
        });
        const automatedOutcome = resolveAutomatedOutcome({
          purchaseId: payload.purchaseId,
          paymentTxHash: payment.txHash,
          payerAddress: payment.fromAddress,
          refundChancePercent: payload.refundChancePercent,
          reference: payload.reference,
        });

        verificationStatus = "valid";
        paymentStatus = "paid";
        payerAddress = payment.fromAddress;
        paymentTxHash = payment.txHash;
        paymentDetectedAt = payment.timestamp;
        statusMessage = "Payment confirmed on-chain.";

        if (automatedOutcome.outcome === "lost") {
          outcomeStatus = "lost";
          payoutStatus = "none";
          statusMessage = "Payment confirmed. This checkout was not selected for a refund.";
        }

        if (automatedOutcome.outcome === "won") {
          outcomeStatus = "won";
          payoutStatus = runtimePayout?.status ?? "queued";
          statusMessage = "Payment confirmed. Refund flow is being executed automatically.";
        }

        if (runtimePayout?.status === "processing") {
          payoutStatus = "processing";
          statusMessage = "Payment confirmed. Refund transaction is processing.";
        }

        if (runtimePayout?.status === "failed") {
          payoutStatus = "failed";
          statusMessage = "Payment confirmed, but the automatic refund failed and needs a retry.";
        }

        if (runtimePayout?.status === "refunded") {
          payoutStatus = "refunded";
          payoutTxHash = runtimePayout.txHash;
          statusMessage = "Refund confirmed on-chain.";
        }
      }
    }
  }

  return {
    ...payload,
    ticket,
    paymentStatus,
    outcomeStatus,
    payoutStatus,
    verificationStatus,
    verifiedAmountCrc,
    verifiedAmountAttoCrc,
    payerAddress,
    payerDisplayName,
    paymentTxHash,
    payoutTxHash,
    paymentDetectedAt,
    balanceCrc,
    statusMessage,
  };
}
