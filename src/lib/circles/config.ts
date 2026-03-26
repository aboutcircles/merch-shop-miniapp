import "server-only";

import { circlesConfig } from "@aboutcircles/sdk-core";
import { gnosis } from "viem/chains";

import { getEnv } from "@/lib/env";

export const circlesChain = gnosis;

export function getRuntimeCirclesConfig() {
  const env = getEnv();
  const chainConfig = circlesConfig[env.CIRCLES_CHAIN_ID];

  if (!chainConfig) {
    throw new Error(`Unsupported Circles chain id: ${env.CIRCLES_CHAIN_ID}`);
  }

  return {
    ...chainConfig,
    circlesRpcUrl: env.CIRCLES_RPC_URL,
  };
}
