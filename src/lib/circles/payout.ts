import "server-only";

import type { Address, TokenBalance } from "@aboutcircles/sdk-types";
import type { TransactionReceipt } from "viem";
import { formatUnits } from "viem";

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

function formatCrcAmount(value: bigint) {
  return `${formatUnits(value, 18)} CRC`;
}

function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

const SUPPORTED_REFUND_TOKEN_ADDRESSES = [
  "0x93eD5A96347927ff6fF6b790F8Cf5258240c321f",
  "0xC19BC204eb1c1D5B3FE500E5E5dfaBaB625F286c",
] as const;

const SUPPORTED_REFUND_TOKEN_SET = new Set(
  SUPPORTED_REFUND_TOKEN_ADDRESSES.map((address) => normalizeAddress(address)),
);

function isSupportedRefundTokenAddress(tokenAddress: string) {
  return SUPPORTED_REFUND_TOKEN_SET.has(normalizeAddress(tokenAddress));
}

function formatSupportedRefundTokens() {
  return SUPPORTED_REFUND_TOKEN_ADDRESSES.join(", ");
}

function getSpendableErc1155Balances(balances: TokenBalance[]) {
  return balances
    .filter(
      (balance) =>
        balance.isErc1155 &&
        !balance.isWrapped &&
        balance.attoCircles > 0n &&
        isSupportedRefundTokenAddress(balance.tokenAddress),
    )
    .sort((left, right) => {
      if (left.attoCircles === right.attoCircles) {
        return left.tokenId < right.tokenId ? -1 : left.tokenId > right.tokenId ? 1 : 0;
      }

      return left.attoCircles > right.attoCircles ? -1 : 1;
    });
}

function planRefundDirectTransfers(balances: TokenBalance[], targetAmountAttoCircles: bigint) {
  const spendableBalances = getSpendableErc1155Balances(balances);
  const totalAvailableAttoCircles = spendableBalances.reduce((total, balance) => total + balance.attoCircles, 0n);

  if (totalAvailableAttoCircles < targetAmountAttoCircles) {
    throw new Error(
      `Refund execution wallet does not have enough supported ERC-1155 balance to cover the refund. Required ${formatCrcAmount(targetAmountAttoCircles)}, available ${formatCrcAmount(totalAvailableAttoCircles)} across supported token ids ${formatSupportedRefundTokens()}.`,
    );
  }

  let remainingAttoCircles = targetAmountAttoCircles;
  const transfers: Array<{ tokenAddress: Address; amountAttoCircles: bigint }> = [];

  for (const balance of spendableBalances) {
    if (remainingAttoCircles <= 0n) {
      break;
    }

    if (balance.attoCircles <= remainingAttoCircles) {
      transfers.push({
        tokenAddress: balance.tokenAddress,
        amountAttoCircles: balance.attoCircles,
      });
      remainingAttoCircles -= balance.attoCircles;
      continue;
    }

    transfers.push({
      tokenAddress: balance.tokenAddress,
      amountAttoCircles: remainingAttoCircles,
    });
    remainingAttoCircles = 0n;
  }

  if (remainingAttoCircles > 0n) {
    throw new Error("Refund planning failed while building the direct ERC-1155 transfer set.");
  }

  return transfers;
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

    const completedTxHashes: string[] = [];

    try {
      await assertTreasuryHasNativeGas();
      const env = getEnv();
      const sdk = await createTreasurySdk();
      const avatar = await sdk.getAvatar(env.CIRCLES_ORG_ADDRESS as Address);
      const balances = await sdk.data.getBalances(env.CIRCLES_ORG_ADDRESS as Address);
      const transfers = planRefundDirectTransfers(balances, BigInt(verifiedAmountAttoCrc));

      for (const transfer of transfers) {
        const receipt = await avatar.transfer.direct(
          snapshot.payerAddress as Address,
          transfer.amountAttoCircles,
          transfer.tokenAddress,
        );

        if (receipt && typeof (receipt as TransactionReceipt).transactionHash === "string") {
          completedTxHashes.push((receipt as TransactionReceipt).transactionHash);
        } else {
          throw new Error("Refund transfer completed without a transaction hash.");
        }
      }

      const lastTxHash = completedTxHashes[completedTxHashes.length - 1] ?? null;
      const allTxHashes = completedTxHashes.length > 1 ? completedTxHashes.join(",") : null;

      await setPayoutRecord({
        purchaseId: snapshot.purchaseId,
        status: "refunded",
        txHash: lastTxHash,
        errorMessage: allTxHashes,
        updatedAt: new Date().toISOString(),
      });

      return {
        purchaseId: snapshot.purchaseId,
        status: "refunded",
        txHash: lastTxHash,
        errorMessage: null,
      };
    } catch (error) {
      const message = formatRefundError(error);
      const partial = completedTxHashes.length > 0;
      const status: "needs_review" | "failed" = partial ? "needs_review" : "failed";
      const lastTxHash = partial ? completedTxHashes[completedTxHashes.length - 1] : null;
      const detail = partial
        ? `PARTIAL REFUND - manual review required. ${completedTxHashes.length} transfer(s) succeeded (${completedTxHashes.join(", ")}). Failure: ${message}`
        : message;

      await setPayoutRecord({
        purchaseId: snapshot.purchaseId,
        status,
        txHash: lastTxHash,
        errorMessage: detail,
        updatedAt: new Date().toISOString(),
      });

      return {
        purchaseId: snapshot.purchaseId,
        status,
        txHash: lastTxHash,
        errorMessage: detail,
      };
    }
  });
}
