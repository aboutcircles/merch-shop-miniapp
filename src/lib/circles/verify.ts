import "server-only";

import {
  getAvatarDisplayName,
  getOrgBalanceCrc,
  getOrgTransferDataEvents,
  getTransferAmountForTx,
  type CirclesTransferDataEvent,
} from "@/lib/circles/public";
import { transferDataMatchesReference } from "@/lib/circles/transfer-data";
import { getTrackedPurchase, setPurchaseDerivedState, setPurchasePaymentDetails } from "@/lib/idempotency";
import { resolveAutomatedOutcome } from "@/server/services/outcome-service";
import type {
  ChainPayment,
  PurchaseSnapshot,
  PurchaseTicketPayload,
  RuntimeTrackedPurchase,
  VerificationStatus,
} from "@/types";

function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
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
    .find((row) => transferDataMatchesReference(row.data, payload.reference));
}

function applyOutcomeStatus(
  snapshot: Pick<PurchaseSnapshot, "outcomeStatus" | "paymentStatus" | "payoutStatus" | "statusMessage" | "payoutTxHash">,
  trackedPurchase: RuntimeTrackedPurchase | undefined,
  payload: PurchaseTicketPayload,
  paymentTxHash: string,
  payerAddress: string,
) {
  const automatedOutcome = resolveAutomatedOutcome({
    purchaseId: payload.purchaseId,
    paymentTxHash,
    payerAddress,
    refundChancePercent: payload.refundChancePercent,
    reference: payload.reference,
  });

  snapshot.paymentStatus = "paid";
  snapshot.statusMessage = "Payment confirmed on-chain.";

  if (automatedOutcome.outcome === "lost") {
    snapshot.outcomeStatus = "lost";
    snapshot.payoutStatus = "none";
    snapshot.statusMessage = "Payment confirmed. This checkout was not selected for a refund.";
  }

  if (automatedOutcome.outcome === "won") {
    snapshot.outcomeStatus = "won";
    snapshot.payoutStatus = trackedPurchase?.payoutStatus ?? "queued";
    snapshot.statusMessage = "Payment confirmed. Refund flow is being executed automatically.";
  }

  if (trackedPurchase?.payoutStatus === "processing") {
    snapshot.payoutStatus = "processing";
    snapshot.statusMessage = "Payment confirmed. Refund transaction is processing.";
  }

  if (trackedPurchase?.payoutStatus === "failed") {
    snapshot.payoutStatus = "failed";
    snapshot.statusMessage = "Payment confirmed, but the automatic refund failed and needs a retry.";
  }

  if (trackedPurchase?.payoutStatus === "refunded") {
    snapshot.payoutStatus = "refunded";
    snapshot.payoutTxHash = trackedPurchase.payoutTxHash;
    snapshot.statusMessage = "Refund confirmed on-chain.";
  }

  return snapshot;
}

function needsDerivedStateWrite(snapshot: PurchaseSnapshot, trackedPurchase: RuntimeTrackedPurchase | undefined, cancelledAt: string | null) {
  if (!trackedPurchase) {
    return true;
  }

  return (
    trackedPurchase.cancelledAt !== cancelledAt ||
    trackedPurchase.paymentStatus !== snapshot.paymentStatus ||
    trackedPurchase.outcomeStatus !== snapshot.outcomeStatus ||
    trackedPurchase.payoutStatus !== snapshot.payoutStatus ||
    trackedPurchase.verificationStatus !== snapshot.verificationStatus ||
    trackedPurchase.verifiedAmountCrc !== snapshot.verifiedAmountCrc ||
    trackedPurchase.verifiedAmountAttoCrc !== snapshot.verifiedAmountAttoCrc ||
    trackedPurchase.payoutTxHash !== snapshot.payoutTxHash ||
    trackedPurchase.statusMessage !== snapshot.statusMessage
  );
}

export type BuildPurchaseSnapshotOptions = {
  balanceCrc?: string | null;
  persistDerivedState?: boolean;
  persistPaymentDetails?: boolean;
  trackedPurchase?: RuntimeTrackedPurchase;
  transferEvents?: CirclesTransferDataEvent[];
};

export async function buildPurchaseSnapshot(
  payload: PurchaseTicketPayload,
  ticket: string,
  txHash?: string,
  options?: BuildPurchaseSnapshotOptions,
): Promise<PurchaseSnapshot> {
  const [rows, balanceCrc, trackedPurchase] = await Promise.all([
    options?.transferEvents ? Promise.resolve(options.transferEvents) : getOrgTransferDataEvents(250),
    options && "balanceCrc" in options ? Promise.resolve(options.balanceCrc ?? null) : getOrgBalanceCrc(),
    options?.trackedPurchase === undefined ? getTrackedPurchase(payload.purchaseId) : Promise.resolve(options.trackedPurchase),
  ]);

  const paymentRow = findMatchingPayment(payload, rows, txHash);
  const now = Date.now();
  const expired = now > new Date(payload.expiresAt).getTime();
  const hasRecordedPayment =
    trackedPurchase?.paymentStatus === "paid" ||
    Boolean(trackedPurchase?.paymentTxHash && trackedPurchase.payerAddress && trackedPurchase.paymentDetectedAt);
  const isTerminalTrackedPayment =
    trackedPurchase?.paymentStatus === "paid" ||
    trackedPurchase?.paymentStatus === "failed" ||
    trackedPurchase?.paymentStatus === "cancelled";
  const autoCancelled = expired && !paymentRow && !hasRecordedPayment && !isTerminalTrackedPayment;
  const cancelledAt = trackedPurchase?.cancelledAt ?? (autoCancelled ? new Date().toISOString() : null);

  let verificationStatus: VerificationStatus = trackedPurchase?.verificationStatus ?? "pending";
  let paymentStatus: PurchaseSnapshot["paymentStatus"] = trackedPurchase?.paymentStatus ?? "awaiting_payment";
  let outcomeStatus: PurchaseSnapshot["outcomeStatus"] = trackedPurchase?.outcomeStatus ?? "pending";
  let payoutStatus: PurchaseSnapshot["payoutStatus"] = trackedPurchase?.payoutStatus ?? "none";
  let verifiedAmountCrc: string | null = trackedPurchase?.verifiedAmountCrc ?? null;
  let verifiedAmountAttoCrc: string | null = trackedPurchase?.verifiedAmountAttoCrc ?? null;
  let payerAddress: string | null = trackedPurchase?.payerAddress ?? null;
  let payerDisplayName: string | null = trackedPurchase?.payerDisplayName ?? null;
  let paymentTxHash: string | null = trackedPurchase?.paymentTxHash ?? null;
  let paymentDetectedAt: string | null = trackedPurchase?.paymentDetectedAt ?? null;
  let payoutTxHash: string | null = trackedPurchase?.payoutTxHash ?? null;
  let statusMessage = trackedPurchase?.statusMessage ?? "Waiting for an incoming CRC transfer.";

  if (cancelledAt) {
    paymentStatus = "cancelled";
    statusMessage = autoCancelled
      ? "Checkout cancelled after 5 minutes without payment."
      : trackedPurchase?.statusMessage ?? "Checkout cancelled.";
  } else if (
    trackedPurchase &&
    (trackedPurchase.paymentStatus === "paid" || trackedPurchase.paymentStatus === "failed")
  ) {
    paymentStatus = trackedPurchase.paymentStatus;
    outcomeStatus = trackedPurchase.outcomeStatus;
    payoutStatus = trackedPurchase.payoutStatus;
    verificationStatus = trackedPurchase.verificationStatus;
    verifiedAmountCrc = trackedPurchase.verifiedAmountCrc;
    verifiedAmountAttoCrc = trackedPurchase.verifiedAmountAttoCrc;
    payoutTxHash = trackedPurchase.payoutTxHash;
    statusMessage = trackedPurchase.statusMessage;
  } else {
    paymentStatus = "awaiting_payment";
    outcomeStatus = "pending";
    payoutStatus = "none";
    verificationStatus = "pending";
    verifiedAmountCrc = null;
    verifiedAmountAttoCrc = null;
    payoutTxHash = null;
    statusMessage = "Waiting for an incoming CRC transfer.";
  }

  if (txHash && !paymentRow && paymentTxHash && paymentTxHash.toLowerCase() !== txHash.toLowerCase()) {
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
        payerDisplayName =
          trackedPurchase?.payerAddress &&
          normalizeAddress(trackedPurchase.payerAddress) === normalizeAddress(payment.fromAddress)
            ? trackedPurchase.payerDisplayName
            : await getAvatarDisplayName(payment.fromAddress);

        if (
          options?.persistPaymentDetails !== false &&
          (
            trackedPurchase?.payerAddress !== payment.fromAddress ||
            trackedPurchase?.payerDisplayName !== payerDisplayName ||
            trackedPurchase?.paymentTxHash !== payment.txHash ||
            trackedPurchase?.paymentDetectedAt !== payment.timestamp
          )
        ) {
          await setPurchasePaymentDetails({
            purchaseId: payload.purchaseId,
            payerAddress: payment.fromAddress,
            payerDisplayName,
            paymentTxHash: payment.txHash,
            paymentDetectedAt: payment.timestamp,
          });
        }

        verificationStatus = "valid";
        payerAddress = payment.fromAddress;
        paymentTxHash = payment.txHash;
        paymentDetectedAt = payment.timestamp;
        ({
          outcomeStatus,
          paymentStatus,
          payoutStatus,
          statusMessage,
          payoutTxHash,
        } = applyOutcomeStatus(
          { outcomeStatus, paymentStatus, payoutStatus, statusMessage, payoutTxHash },
          trackedPurchase,
          payload,
          payment.txHash,
          payment.fromAddress,
        ));
      }
    }
  } else if (paymentTxHash && payerAddress && paymentDetectedAt && paymentStatus === "paid") {
    if (txHash && paymentTxHash.toLowerCase() !== txHash.toLowerCase()) {
      verificationStatus = "invalid";
      paymentStatus = "failed";
      statusMessage = "Submitted transaction does not match this purchase.";
    } else {
      if (!payerDisplayName) {
        payerDisplayName = await getAvatarDisplayName(payerAddress);
      }

      ({
        outcomeStatus,
        paymentStatus,
        payoutStatus,
        statusMessage,
        payoutTxHash,
      } = applyOutcomeStatus(
        { outcomeStatus, paymentStatus, payoutStatus, statusMessage, payoutTxHash },
        trackedPurchase,
        payload,
        paymentTxHash,
        payerAddress,
      ));
    }
  }

  const snapshot: PurchaseSnapshot = {
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

  if (options?.persistDerivedState !== false && needsDerivedStateWrite(snapshot, trackedPurchase, cancelledAt)) {
    await setPurchaseDerivedState(payload.purchaseId, {
      cancelledAt,
      lastVerifiedAt: new Date().toISOString(),
      outcomeStatus: snapshot.outcomeStatus,
      paymentStatus: snapshot.paymentStatus,
      payoutStatus: snapshot.payoutStatus,
      payoutTxHash: snapshot.payoutTxHash,
      statusMessage: snapshot.statusMessage,
      verificationStatus: snapshot.verificationStatus,
      verifiedAmountAttoCrc: snapshot.verifiedAmountAttoCrc,
      verifiedAmountCrc: snapshot.verifiedAmountCrc,
    });
  }

  return snapshot;
}
