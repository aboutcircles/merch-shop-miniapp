import "server-only";

import { RpcClient, type CirclesEvent } from "@aboutcircles/sdk-rpc";
import type { Address } from "@aboutcircles/sdk-types";

import { getEnv } from "@/lib/env";
import { publishPurchaseSnapshot } from "@/server/services/purchase-events";
import { reconcilePurchases } from "@/server/services/reconcile-service";

const MAX_RECENT_EVENTS = 500;
const RECONCILE_DEBOUNCE_MS = 750;
const RECONCILE_INDEXER_RETRY_MS = 4_000;
const RECONCILE_SAFETY_NET_MS = 30_000;
const WSS_CONNECT_TIMEOUT_MS = 1_500;

type WatcherStatus = "idle" | "connecting" | "open" | "closed" | "disabled";

type CirclesWssState = {
  client: RpcClient | null;
  lastError: string | null;
  lastEventReceivedAt: number;
  pendingEventKeys: Set<string>;
  recentEventKeys: string[];
  recentEventKeySet: Set<string>;
  reconcileTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  safetyNetTimer: ReturnType<typeof setInterval> | null;
  status: WatcherStatus;
  unsubscribe: (() => void) | null;
};

declare global {
  var __ethccBoothCirclesWss: CirclesWssState | undefined;
}

function getState(): CirclesWssState {
  if (!globalThis.__ethccBoothCirclesWss) {
    globalThis.__ethccBoothCirclesWss = {
      client: null,
      lastError: null,
      lastEventReceivedAt: 0,
      pendingEventKeys: new Set(),
      recentEventKeys: [],
      recentEventKeySet: new Set(),
      reconcileTimer: null,
      reconnectAttempt: 0,
      reconnectTimer: null,
      safetyNetTimer: null,
      status: "idle",
      unsubscribe: null,
    };
  }

  return globalThis.__ethccBoothCirclesWss;
}

function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Circles SDK listener error.";
}

function isLoopbackHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.startsWith("127.")
  );
}

function getCirclesSubscriptionWsUrl(rpcUrl: string) {
  const url = new URL(rpcUrl);

  if (url.protocol === "https:") {
    url.protocol = "wss:";
  }

  if (url.protocol === "http:") {
    url.protocol = "ws:";
  }

  const wsUrl = url.toString();
  return wsUrl.endsWith("/") ? `${wsUrl}ws/subscribe` : `${wsUrl}/ws/subscribe`;
}

function shouldUseCirclesWssListener() {
  const env = getEnv();

  if (env.CIRCLES_WSS_LISTENER_ENABLED !== undefined) {
    return {
      enabled: env.CIRCLES_WSS_LISTENER_ENABLED,
      reason: env.CIRCLES_WSS_LISTENER_ENABLED
        ? null
        : "Circles WebSocket watcher disabled by CIRCLES_WSS_LISTENER_ENABLED=false.",
    };
  }

  const rpcUrl = new URL(env.CIRCLES_RPC_URL);

  if (rpcUrl.protocol === "http:" && isLoopbackHostname(rpcUrl.hostname)) {
    return {
      enabled: false,
      reason:
        "Circles WebSocket watcher auto-disabled for local HTTP RPC URL. Use explicit payment verification or reconcile polling for local fork tests.",
    };
  }

  return {
    enabled: true,
    reason: null,
  };
}

function canConnectToSubscriptionWebSocket(rpcUrl: string) {
  const wsUrl = getCirclesSubscriptionWsUrl(rpcUrl);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const socket = new WebSocket(wsUrl);
    const finish = (connected: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.close();
      }

      resolve(connected);
    };
    const timeout = setTimeout(() => finish(false), WSS_CONNECT_TIMEOUT_MS);

    socket.onopen = () => finish(true);
    socket.onerror = () => finish(false);
    socket.onclose = () => finish(false);
  });
}

function isInboundOrgTransfer(event: CirclesEvent) {
  if (
    event.$event !== "CrcV2_TransferSingle" &&
    event.$event !== "CrcV2_TransferBatch" &&
    event.$event !== "CrcV2_StreamCompleted"
  ) {
    return false;
  }

  if (typeof event.to !== "string") {
    return false;
  }

  return normalizeAddress(event.to) === normalizeAddress(getEnv().CIRCLES_ORG_ADDRESS);
}

function getEventKey(event: CirclesEvent) {
  return (
    event.transactionHash?.toLowerCase() ??
    `${event.blockNumber}:${event.transactionIndex}:${event.logIndex}:${event.$event}`
  );
}

function rememberEvent(state: CirclesWssState, event: CirclesEvent) {
  const key = getEventKey(event);

  if (state.recentEventKeySet.has(key)) {
    return null;
  }

  state.recentEventKeySet.add(key);
  state.recentEventKeys.push(key);

  if (state.recentEventKeys.length > MAX_RECENT_EVENTS) {
    const oldest = state.recentEventKeys.shift();

    if (oldest) {
      state.recentEventKeySet.delete(oldest);
    }
  }

  return key;
}

function scheduleReconnect(state: CirclesWssState) {
  if (state.reconnectTimer) {
    return;
  }

  const baseDelay = Math.min(1_000 * 2 ** state.reconnectAttempt, 60_000);
  const jitter = Math.floor(Math.random() * 500);
  state.reconnectAttempt += 1;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    void connect(state);
  }, baseDelay + jitter);
}

async function runReconcile(state: CirclesWssState) {
  state.reconcileTimer = null;
  state.pendingEventKeys.clear();

  try {
    const snapshots = await reconcilePurchases();

    for (const snapshot of snapshots) {
      if (snapshot) {
        publishPurchaseSnapshot(snapshot);
      }
    }

    state.lastError = null;
  } catch (error) {
    state.lastError = getErrorMessage(error);
  }
}

function scheduleReconcile(state: CirclesWssState, eventKey: string, delayMs = RECONCILE_DEBOUNCE_MS) {
  state.pendingEventKeys.add(eventKey);

  if (state.reconcileTimer) {
    return;
  }

  state.reconcileTimer = setTimeout(() => {
    void runReconcile(state);
  }, delayMs);
}

function handleCirclesEvent(state: CirclesWssState, event: CirclesEvent) {
  state.lastEventReceivedAt = Date.now();

  if (!isInboundOrgTransfer(event)) {
    return;
  }

  const eventKey = rememberEvent(state, event);

  if (!eventKey) {
    return;
  }

  scheduleReconcile(state, eventKey);
  setTimeout(() => scheduleReconcile(state, eventKey, 0), RECONCILE_INDEXER_RETRY_MS);
}

function ensureSafetyNetReconcile(state: CirclesWssState) {
  if (state.safetyNetTimer) {
    return;
  }

  state.safetyNetTimer = setInterval(() => {
    scheduleReconcile(state, `safety-net:${Date.now()}`, 0);
  }, RECONCILE_SAFETY_NET_MS);

  if (typeof state.safetyNetTimer === "object" && state.safetyNetTimer !== null) {
    const handle = state.safetyNetTimer as { unref?: () => void };
    handle.unref?.();
  }
}

async function connect(state: CirclesWssState) {
  if (
    state.status === "connecting" ||
    state.status === "open" ||
    state.status === "disabled" ||
    state.reconnectTimer
  ) {
    return;
  }

  const listenerConfig = shouldUseCirclesWssListener();

  if (!listenerConfig.enabled) {
    state.lastError = listenerConfig.reason;
    state.status = "disabled";
    return;
  }

  if (typeof WebSocket === "undefined") {
    state.lastError = "The current Node.js runtime does not expose WebSocket.";
    state.status = "closed";
    return;
  }

  state.status = "connecting";

  try {
    const env = getEnv();

    if (!(await canConnectToSubscriptionWebSocket(env.CIRCLES_RPC_URL))) {
      throw new Error(
        `Circles WebSocket subscription endpoint is unavailable at ${getCirclesSubscriptionWsUrl(env.CIRCLES_RPC_URL)}.`,
      );
    }

    const client = new RpcClient(env.CIRCLES_RPC_URL);
    const events = await client.subscribe(env.CIRCLES_ORG_ADDRESS as Address);

    state.client = client;
    state.unsubscribe = events.subscribe((event) => handleCirclesEvent(state, event));
    state.lastError = null;
    state.reconnectAttempt = 0;
    state.status = "open";
    scheduleReconcile(state, "startup", 0);
  } catch (error) {
    state.client = null;
    state.unsubscribe?.();
    state.unsubscribe = null;
    state.status = "closed";
    state.lastError = getErrorMessage(error);
    scheduleReconnect(state);
  }
}

export function ensureCirclesPaymentWatcher() {
  const state = getState();
  ensureSafetyNetReconcile(state);
  void connect(state);
}

export function getCirclesPaymentWatcherStatus() {
  const state = getState();

  return {
    lastError: state.lastError,
    lastEventReceivedAt: state.lastEventReceivedAt
      ? new Date(state.lastEventReceivedAt).toISOString()
      : null,
    pendingEventCount: state.pendingEventKeys.size,
    status: state.status,
  };
}
