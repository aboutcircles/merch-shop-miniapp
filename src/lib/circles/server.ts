import "server-only";

import { Sdk } from "@aboutcircles/sdk";
import { SafeContractRunner } from "@aboutcircles/sdk-runner";
import type { Address, Hex, TransactionRequest } from "@aboutcircles/sdk-types";
import { createPublicClient, createWalletClient, http } from "viem";
import type { PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { getRuntimeCirclesConfig, circlesChain } from "@/lib/circles/config";
import { getEnv } from "@/lib/env";

type ContractRunner = {
  address?: Address;
  publicClient: PublicClient;
  init: () => Promise<void>;
  estimateGas: (tx: TransactionRequest) => Promise<bigint>;
  call: (tx: TransactionRequest) => Promise<string>;
  resolveName: (name: string) => Promise<string | null>;
  sendTransaction: (txs: TransactionRequest[]) => Promise<unknown>;
};

export function getTreasuryExecutionAddress() {
  const env = getEnv();
  const account = privateKeyToAccount(env.CIRCLES_TREASURY_PRIVATE_KEY as Hex);

  return account.address;
}

export function getCirclesPublicClient() {
  const env = getEnv();

  return createPublicClient({
    chain: circlesChain,
    transport: http(env.CIRCLES_RPC_URL),
  });
}

export async function createTreasurySdk() {
  const env = getEnv();
  const account = privateKeyToAccount(env.CIRCLES_TREASURY_PRIVATE_KEY as Hex);
  const inferredSafeAddress: Address | undefined =
    (env.CIRCLES_TREASURY_SAFE_ADDRESS as Address | undefined) ??
    (account.address.toLowerCase() !== env.CIRCLES_ORG_ADDRESS.toLowerCase()
      ? (env.CIRCLES_ORG_ADDRESS as Address)
      : undefined);

  if (inferredSafeAddress) {
    const runner = await SafeContractRunner.create(
      env.CIRCLES_RPC_URL,
      env.CIRCLES_TREASURY_PRIVATE_KEY as Hex,
      inferredSafeAddress,
      circlesChain,
    );

    return new Sdk(getRuntimeCirclesConfig(), runner);
  }

  const publicClient = getCirclesPublicClient();
  const walletClient = createWalletClient({
    account,
    chain: circlesChain,
    transport: http(env.CIRCLES_RPC_URL),
  });

  const runner: ContractRunner = {
    address: account.address,
    publicClient,
    async init() {
      return;
    },
    estimateGas(tx) {
      return publicClient.estimateGas({
        account,
        ...tx,
      });
    },
    async call(tx) {
      const result = await publicClient.call({
        account,
        ...tx,
      });

      return result.data ?? "0x";
    },
    resolveName(name) {
      return publicClient.getEnsAddress({ name });
    },
    async sendTransaction(txs) {
      let receipt: unknown;

      for (const tx of txs) {
        const hash = await walletClient.sendTransaction({
          account,
          chain: circlesChain,
          to: tx.to,
          value: tx.value,
          data: tx.data,
          gas: tx.gas,
          nonce: tx.nonce,
          gasPrice: tx.gasPrice,
        });

        receipt = await publicClient.waitForTransactionReceipt({ hash });
      }

      if (!receipt) {
        throw new Error("No transactions were submitted.");
      }

      return receipt;
    },
  };

  await runner.init();

  return new Sdk(getRuntimeCirclesConfig(), runner);
}
