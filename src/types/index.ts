export type PaymentStatus = "initiated" | "awaiting_payment" | "paid" | "expired" | "failed" | "cancelled";
export type OutcomeStatus = "pending" | "won" | "lost";
export type PayoutStatus = "none" | "queued" | "processing" | "refunded" | "failed" | "needs_review";
export type VerificationStatus = "pending" | "valid" | "invalid" | "duplicate";

export interface MerchItem {
  id: string;
  slug: string;
  name: string;
  image: string;
  priceCrc: string;
  minPriceCrc: string;
  maxPriceCrc: string;
  stock: number;
  isActive: boolean;
  tag: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MerchPricingRecord {
  id: string;
  priceCrc: string;
  minPriceCrc: string;
  maxPriceCrc: string;
}

export interface PurchaseTicketPayload {
  purchaseId: string;
  reference: string;
  merchItemId: string;
  merchSlug: string;
  merchName: string;
  selectedAmountCrc: string;
  refundChancePercent: number;
  expectedAmountCrc: string;
  expectedAmountAttoCrc: string;
  receivingAddress: string;
  chainId: number;
  qrPayload: string;
  createdAt: string;
  expiresAt: string;
}

export interface PurchaseIntent extends PurchaseTicketPayload {
  ticket: string;
}

export interface ChainPayment {
  txHash: string;
  fromAddress: string;
  toAddress: string;
  tokenAddress: string;
  amountCrc: string;
  amountAttoCrc: string;
  timestamp: string;
}

export interface PurchaseSnapshot extends PurchaseTicketPayload {
  ticket: string;
  paymentStatus: PaymentStatus;
  outcomeStatus: OutcomeStatus;
  payoutStatus: PayoutStatus;
  verificationStatus: VerificationStatus;
  verifiedAmountCrc: string | null;
  verifiedAmountAttoCrc: string | null;
  payerAddress: string | null;
  payerDisplayName: string | null;
  paymentTxHash: string | null;
  payoutTxHash: string | null;
  paymentDetectedAt: string | null;
  balanceCrc: string | null;
  statusMessage: string;
}

export interface RuntimeTrackedPurchase {
  purchaseId: string;
  reference: string;
  merchItemId: string;
  merchName: string;
  ticket: string;
  createdAt: string;
  expiresAt: string;
  cancelledAt: string | null;
  payerAddress: string | null;
  payerDisplayName: string | null;
  paymentTxHash: string | null;
  paymentDetectedAt: string | null;
  paymentStatus: PaymentStatus;
  outcomeStatus: OutcomeStatus;
  payoutStatus: PayoutStatus;
  verificationStatus: VerificationStatus;
  verifiedAmountCrc: string | null;
  verifiedAmountAttoCrc: string | null;
  payoutTxHash: string | null;
  statusMessage: string;
  lastVerifiedAt: string | null;
}

export interface RuntimePayoutRecord {
  purchaseId: string;
  status: PayoutStatus;
  txHash: string | null;
  errorMessage: string | null;
  updatedAt: string;
}

export interface PayoutExecutionResult {
  purchaseId: string;
  status: PayoutStatus;
  txHash: string | null;
  errorMessage: string | null;
}

export type AdminTransactionKind = "payment" | "refund";
export type AdminTransactionStatus = "pending" | "confirmed" | "failed";

export interface AdminTransactionSnapshot {
  id: string;
  kind: AdminTransactionKind;
  status: AdminTransactionStatus;
  purchaseId: string;
  reference: string;
  merchName: string;
  amountCrc: string;
  txHash: string | null;
  actorAddress: string | null;
  actorDisplayName: string | null;
  createdAt: string;
  detectedAt: string | null;
  statusMessage: string;
}
