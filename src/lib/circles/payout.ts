import "server-only";

import type { Address } from "@aboutcircles/sdk-types";

import { getEnv } from "@/lib/env";
import { createTreasurySdk } from "@/lib/circles/server";
import { claimPayoutProcessing, setPayoutRecord, withKeyLock } from "@/lib/idempotency";
import type { PayoutExecutionResult, PurchaseSnapshot } from "@/types";

export async function executeRefund(snapshot: PurchaseSnapshot): Promise<PayoutExecutionResult> {
  if (!snapshot.payerAddress) {
    throw new Error("Cannot send a refund before the payer address is known.");
  }

  if (!snapshot.verifiedAmountAttoCrc) {
    throw new Error("Cannot send a refund before the payment amount is verified on-chain.");
  }

  const verifiedAmountAttoCrc = snapshot.verifiedAmountAttoCrc;

  return withKeyLock(`payout:${snapshot.purchaseId}`, async () => {
    const claim = await claimPayoutProcessing(snapshot.purchaseId);

    if (!claim.claimed) {
      return {
        purchaseId: snapshot.purchaseId,
        status: claim.record.status,
        txHash: claim.record.txHash,
        errorMessage: claim.record.errorMessage,
      };
    }

    try {
      const env = getEnv();
      const sdk = await createTreasurySdk();
      const avatar = await sdk.getAvatar(env.CIRCLES_ORG_ADDRESS as Address);

      const receipt = await avatar.transfer.direct(
        snapshot.payerAddress as Address,
        BigInt(verifiedAmountAttoCrc),
        snapshot.payerAddress as Address,
      );

      const txHash =
        "transactionHash" in receipt && typeof receipt.transactionHash === "string"
          ? receipt.transactionHash
          : null;

      await setPayoutRecord({
        purchaseId: snapshot.purchaseId,
        status: "refunded",
        txHash,
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      });

      return {
        purchaseId: snapshot.purchaseId,
        status: "refunded",
        txHash,
        errorMessage: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refund execution failed.";

      await setPayoutRecord({
        purchaseId: snapshot.purchaseId,
        status: "failed",
        txHash: null,
        errorMessage: message,
        updatedAt: new Date().toISOString(),
      });

      return {
        purchaseId: snapshot.purchaseId,
        status: "failed",
        txHash: null,
        errorMessage: message,
      };
    }
  });
}
