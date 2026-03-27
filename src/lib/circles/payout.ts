import "server-only";

import type { Address } from "@aboutcircles/sdk-types";

import { getEnv } from "@/lib/env";
import { createTreasurySdk, getCirclesPublicClient, getTreasuryExecutionAddress } from "@/lib/circles/server";
import { claimPayoutProcessing, setPayoutRecord, withKeyLock } from "@/lib/idempotency";
import type { PayoutExecutionResult, PurchaseSnapshot } from "@/types";

async function assertTreasuryHasNativeGas() {
  const sender = getTreasuryExecutionAddress();
  const balance = await getCirclesPublicClient().getBalance({ address: sender });

  if (balance <= 0n) {
    throw new Error(
      `Refund execution wallet ${sender} has no native gas balance. Fund it with xDAI on Gnosis/Circles before retrying refunds.`,
    );
  }
}

function formatRefundError(error: unknown) {
  const message = error instanceof Error ? error.message : "Refund execution failed.";

  if (message.includes("insufficient MaxFeePerGas for sender balance")) {
    const sender = getTreasuryExecutionAddress();
    return `Refund execution wallet ${sender} does not have enough native gas to submit the Safe transaction. Fund it with xDAI on Gnosis/Circles and retry.`;
  }

  return message;
}

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
      await assertTreasuryHasNativeGas();
      const env = getEnv();
      const sdk = await createTreasurySdk();
      const avatar = await sdk.getAvatar(env.CIRCLES_ORG_ADDRESS as Address);

      const receipt = await avatar.transfer.advanced(
        snapshot.payerAddress as Address,
        BigInt(verifiedAmountAttoCrc),
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
      const message = formatRefundError(error);

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
