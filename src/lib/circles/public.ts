import "server-only";

import { hubV2Abi } from "@aboutcircles/sdk-abis/hubV2";
import { Sdk } from "@aboutcircles/sdk";
import type { Address } from "@aboutcircles/sdk-types";
import { createPublicClient, decodeEventLog, http } from "viem";

import { circlesChain, getRuntimeCirclesConfig } from "@/lib/circles/config";
import { getEnv } from "@/lib/env";
import { fromAttoCrc } from "@/lib/utils";

export function getPublicClient() {
  const env = getEnv();

  return createPublicClient({
    chain: circlesChain,
    transport: http(env.CIRCLES_RPC_URL),
  });
}

export function getReadOnlySdk() {
  return new Sdk(getRuntimeCirclesConfig());
}

declare global {
  var __ethccBoothCirclesNameCache: Map<string, string | null> | undefined;
}

export interface CirclesTransferDataEvent {
  transactionHash: string;
  from: string;
  to: string;
  data: string;
  timestamp: string;
  blockNumber: string;
  transactionIndex: string;
  logIndex: string;
}

export interface CirclesTransferAmount {
  amountAttoCrc: string;
  amountCrc: string;
}

type TransferDataEventPayload = {
  values?: Record<string, unknown>;
};

type TransferDataQueryResult = TransferDataEventPayload[] | { events?: TransferDataEventPayload[] };
type SearchProfilesResult = Array<{
  address?: string;
  name?: string | null;
}>;

export async function getOrgAvatar() {
  const env = getEnv();
  const sdk = getReadOnlySdk();

  return sdk.getAvatar(env.CIRCLES_ORG_ADDRESS as Address);
}

function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

function getCirclesNameCache() {
  if (!globalThis.__ethccBoothCirclesNameCache) {
    globalThis.__ethccBoothCirclesNameCache = new Map();
  }

  return globalThis.__ethccBoothCirclesNameCache;
}

function mapTransferDataEvents(events: TransferDataEventPayload[] = []): CirclesTransferDataEvent[] {
  return events.map((event) => {
    const values = event.values ?? {};

    return {
      transactionHash: String(values.transactionHash ?? ""),
      from: String(values.from ?? ""),
      to: String(values.to ?? ""),
      data: String(values.data ?? ""),
      timestamp: String(values.timestamp ?? ""),
      blockNumber: String(values.blockNumber ?? ""),
      transactionIndex: String(values.transactionIndex ?? ""),
      logIndex: String(values.logIndex ?? ""),
    };
  });
}

async function circlesEventsQuery(recipientAddress: string) {
  const env = getEnv();
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "circles_events",
    params: [recipientAddress, null, null, ["CrcV2_TransferData"]],
  };

  const response = await fetch(env.CIRCLES_RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`circles_events failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as { error?: { message?: string }; result?: TransferDataQueryResult };

  if (payload.error) {
    throw new Error(payload.error.message ?? "circles_events returned an error");
  }

  const rawEvents = Array.isArray(payload.result) ? payload.result : (payload.result?.events ?? []);

  return mapTransferDataEvents(rawEvents);
}

export async function getOrgTransferDataEvents(limit = 150) {
  const env = getEnv();
  const recipientAddress = normalizeAddress(env.CIRCLES_ORG_ADDRESS);

  if (!recipientAddress) {
    return [];
  }

  const events = await circlesEventsQuery(recipientAddress);
  return events.slice(0, limit);
}

function sumMatchingTransfers(
  logs: Awaited<ReturnType<ReturnType<typeof getPublicClient>["getTransactionReceipt"]>>["logs"],
  fromAddress: string,
  toAddress: string,
) {
  const hubAddress = normalizeAddress(getRuntimeCirclesConfig().v2HubAddress);
  const normalizedFrom = normalizeAddress(fromAddress);
  const normalizedTo = normalizeAddress(toAddress);
  let streamedTotal = 0n;
  let directTransferTotal = 0n;

  for (const log of logs) {
    if (normalizeAddress(log.address) !== hubAddress) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: hubV2Abi,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === "StreamCompleted") {
        if (
          normalizeAddress(decoded.args.from) === normalizedFrom &&
          normalizeAddress(decoded.args.to) === normalizedTo
        ) {
          streamedTotal += decoded.args.amounts.reduce((sum, value) => sum + value, 0n);
        }
        continue;
      }

      if (decoded.eventName === "TransferSingle") {
        if (
          normalizeAddress(decoded.args.from) === normalizedFrom &&
          normalizeAddress(decoded.args.to) === normalizedTo
        ) {
          directTransferTotal += decoded.args.value;
        }
        continue;
      }

      if (decoded.eventName === "TransferBatch") {
        if (
          normalizeAddress(decoded.args.from) === normalizedFrom &&
          normalizeAddress(decoded.args.to) === normalizedTo
        ) {
          directTransferTotal += decoded.args.values.reduce((sum, value) => sum + value, 0n);
        }
      }
    } catch {
      continue;
    }
  }

  return streamedTotal > 0n ? streamedTotal : directTransferTotal;
}

export async function getTransferAmountForTx(event: Pick<CirclesTransferDataEvent, "transactionHash" | "from" | "to">) {
  const receipt = await getPublicClient().getTransactionReceipt({
    hash: event.transactionHash as `0x${string}`,
  });
  const totalAttoCrc = sumMatchingTransfers(receipt.logs, event.from, event.to);

  if (totalAttoCrc <= 0n) {
    return null;
  }

  return {
    amountAttoCrc: totalAttoCrc.toString(),
    amountCrc: fromAttoCrc(totalAttoCrc),
  } satisfies CirclesTransferAmount;
}

export async function getOrgBalanceCrc() {
  try {
    const env = getEnv();
    const balances = await getReadOnlySdk().rpc.balance.getTokenBalances(env.CIRCLES_ORG_ADDRESS as Address);
    const totalAttoCrc = balances.reduce((sum, balance) => sum + BigInt(balance.attoCrc ?? "0"), 0n);
    return fromAttoCrc(totalAttoCrc);
  } catch {
    return null;
  }
}

export async function getAvatarDisplayName(address: string) {
  const normalized = normalizeAddress(address);

  if (!normalized) {
    return null;
  }

  const cache = getCirclesNameCache();

  if (cache.has(normalized)) {
    return cache.get(normalized) ?? null;
  }

  try {
    const sdk = getReadOnlySdk();
    const searchResults = (await sdk.rpc.client.call("circles_searchProfiles", [
      normalized,
      10,
      0,
    ])) as SearchProfilesResult;
    const matchedProfile = searchResults.find(
      (profile) => normalizeAddress(profile.address ?? "") === normalized,
    );
    const matchedName = matchedProfile?.name?.trim() || null;

    if (matchedName) {
      cache.set(normalized, matchedName);
      return matchedName;
    }

    const avatar = await sdk.getAvatar(normalized as Address);
    const profile = await avatar.profile.get();
    const displayName = profile?.name?.trim() || null;
    cache.set(normalized, displayName);
    return displayName;
  } catch {
    cache.set(normalized, null);
    return null;
  }
}
