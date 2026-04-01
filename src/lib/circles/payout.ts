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
  "0x43322ADF67D969219d014D60C860966269F4F93E",
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

    try {
      await assertTreasuryHasNativeGas();
      const env = getEnv();
      const sdk = await createTreasurySdk();
      const avatar = await sdk.getAvatar(env.CIRCLES_ORG_ADDRESS as Address);
      const balances = await sdk.data.getBalances(env.CIRCLES_ORG_ADDRESS as Address);
      const transfers = planRefundDirectTransfers(balances, BigInt(verifiedAmountAttoCrc));
      let receipt: TransactionReceipt | null = null;

      for (const transfer of transfers) {
        receipt = await avatar.transfer.direct(
          snapshot.payerAddress as Address,
          transfer.amountAttoCircles,
          transfer.tokenAddress,
        );
      }

      const txHash =
        receipt && typeof receipt.transactionHash === "string"
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
