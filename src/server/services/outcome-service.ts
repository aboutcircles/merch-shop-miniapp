import "server-only";

import crypto from "node:crypto";

type AutomatedOutcomeInput = {
  purchaseId: string;
  paymentTxHash: string;
  payerAddress: string;
  refundChancePercent: number;
  reference: string;
};

export function resolveAutomatedOutcome({
  purchaseId,
  paymentTxHash,
  payerAddress,
  refundChancePercent,
  reference,
}: AutomatedOutcomeInput) {
  const seed = `${purchaseId}:${paymentTxHash.toLowerCase()}:${payerAddress.toLowerCase()}:${reference}`;
  const digest = crypto.createHash("sha256").update(seed).digest("hex");
  const bucket = Number.parseInt(digest.slice(0, 8), 16) % 100;
  const outcome = bucket < refundChancePercent ? "won" : "lost";

  return {
    outcome,
    bucket,
  } as const;
}
