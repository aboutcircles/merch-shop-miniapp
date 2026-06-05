import "server-only";

import { getRuntimeCirclesConfig } from "@/lib/circles/config";
import { getEnv } from "@/lib/env";
import { publishPurchaseSnapshot } from "@/server/services/purchase-events";
import { reconcilePurchases, reconcileTransaction } from "@/server/services/reconcile-service";

const MAX_RECENT_EVENTS = 500;
const RECONCILE_DEBOUNCE_MS = 750;
// After a chain transfer log we re-check on an escalating schedule to cover
// Circles indexer lag: the CrcV2_TransferData row that carries the payment
// reference (used to match a transfer to a checkout) can land a few seconds
// after the raw transfer log arrives over the socket. The fast path decodes the
// reference straight from calldata so it usually wins, but these offsets close
// the gap for any payment the fast path misses.
const RECONCILE_BURST_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 12_000];
const RECONCILE_SAFETY_NET_MS = 5_000;
const WSS_CONNECT_TIMEOUT_MS = 10_000;
const WSS_KEEPALIVE_MS = 25_000;

// ERC-1155 event signatures emitted by the Circles v2 Hub. We subscribe to the
// raw chain logs (not the Circles indexer stream) so a payment is observed the
// instant its block is mined, ahead of indexer ingestion.
const TRANSFER_SINGLE_TOPIC = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const TRANSFER_BATCH_TOPIC = "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";

type WatcherStatus = "idle" | "connecting" | "open" | "closed" | "disabled";

// Minimal inbound-transfer shape derived from a raw chain log. Carries exactly
// what the fast path + reconcile need to confirm a payment from the chain.
type InboundTransferEvent = {
  $event: "CrcV2_TransferSingle" | "CrcV2_TransferBatch";
  transactionHash: string;
  from: string;
  to: string;
  blockNumber?: number;
  transactionIndex?: number;
  logIndex?: number;
  timestamp?: number;
};

type JsonRpcMessage = {
  id?: number;
  result?: unknown;
  error?: { message?: string };
  method?: string;
  params?: { subscription?: string; result?: ChainLog };
};

type ChainLog = {
  transactionHash?: string;
  blockNumber?: string;
  transactionIndex?: string;
  logIndex?: string;
  topics?: string[];
};

type CirclesWssState = {
  socket: WebSocket | null;
  subscriptionId: string | null;
  subscribeRequestId: number | null;
  requestId: number;
  keepAliveTimer: ReturnType<typeof setInterval> | null;
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
};

declare global {
  var __ethccBoothCirclesWss: CirclesWssState | undefined;
}

function getState(): CirclesWssState {
  if (!globalThis.__ethccBoothCirclesWss) {
    globalThis.__ethccBoothCirclesWss = {
      socket: null,
      subscriptionId: null,
      subscribeRequestId: null,
      requestId: 0,
      keepAliveTimer: null,
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
    };
  }

  return globalThis.__ethccBoothCirclesWss;
}

function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Circles chain listener error.";
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

function getChainWsUrl(rpcUrl: string) {
  const url = new URL(rpcUrl);

  if (url.protocol === "https:") {
    url.protocol = "wss:";
  }

  if (url.protocol === "http:") {
    url.protocol = "ws:";
  }

  const wsUrl = url.toString();
  return wsUrl.endsWith("/") ? `${wsUrl}ws/chain` : `${wsUrl}/ws/chain`;
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

function toAddressTopic(address: string) {
  return `0x${"0".repeat(24)}${normalizeAddress(address).replace(/^0x/, "")}`;
}

function topicToAddress(topic: string) {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function hexToNumber(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function logToTransferEvent(log: ChainLog | undefined): InboundTransferEvent | null {
  if (!log || typeof log.transactionHash !== "string" || !Array.isArray(log.topics)) {
    return null;
  }

  const [topic0, , fromTopic, toTopic] = log.topics;

  if (typeof fromTopic !== "string" || typeof toTopic !== "string") {
    return null;
  }

  return {
    $event: topic0 === TRANSFER_BATCH_TOPIC ? "CrcV2_TransferBatch" : "CrcV2_TransferSingle",
    transactionHash: log.transactionHash,
    from: topicToAddress(fromTopic),
    to: topicToAddress(toTopic),
    blockNumber: hexToNumber(log.blockNumber),
    transactionIndex: hexToNumber(log.transactionIndex),
    logIndex: hexToNumber(log.logIndex),
  };
}

function isInboundOrgTransfer(event: InboundTransferEvent) {
  return normalizeAddress(event.to) === normalizeAddress(getEnv().CIRCLES_ORG_ADDRESS);
}

function getEventKey(event: InboundTransferEvent) {
  return (
    event.transactionHash?.toLowerCase() ??
    `${event.blockNumber}:${event.transactionIndex}:${event.logIndex}:${event.$event}`
  );
}

function rememberEvent(state: CirclesWssState, event: InboundTransferEvent) {
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

async function runTransactionFastPath(state: CirclesWssState, event: InboundTransferEvent) {
  if (typeof event.transactionHash !== "string") {
    return;
  }

  try {
    const snapshots = await reconcileTransaction({
      transactionHash: event.transactionHash,
      from: typeof event.from === "string" ? event.from : "",
      to: typeof event.to === "string" ? event.to : "",
      timestamp: typeof event.timestamp === "number" ? String(event.timestamp) : undefined,
      blockNumber: event.blockNumber !== undefined ? String(event.blockNumber) : undefined,
      transactionIndex: event.transactionIndex !== undefined ? String(event.transactionIndex) : undefined,
      logIndex: event.logIndex !== undefined ? String(event.logIndex) : undefined,
    });

    for (const snapshot of snapshots) {
      if (snapshot) {
        publishPurchaseSnapshot(snapshot);
      }
    }

    if (snapshots.length > 0) {
      state.lastError = null;
    }
  } catch (error) {
    state.lastError = getErrorMessage(error);
  }
}

function handleCirclesEvent(state: CirclesWssState, event: InboundTransferEvent) {
  state.lastEventReceivedAt = Date.now();

  if (!isInboundOrgTransfer(event)) {
    return;
  }

  const eventKey = rememberEvent(state, event);

  if (!eventKey) {
    return;
  }

  // Fast path: decode the payment reference straight from the transaction
  // calldata so a payment is confirmed the moment the transfer log arrives,
  // rather than waiting for the indexer to expose the CrcV2_TransferData row.
  void runTransactionFastPath(state, event);

  // Indexer-based fallback: an escalating reconcile burst that still catches
  // payments the fast path misses (e.g. an unexpected calldata shape).
  scheduleReconcile(state, eventKey);

  for (const delay of RECONCILE_BURST_DELAYS_MS) {
    setTimeout(() => scheduleReconcile(state, eventKey, 0), delay);
  }
}

function sendRpc(state: CirclesWssState, method: string, params: unknown[]) {
  const socket = state.socket;

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return null;
  }

  const id = (state.requestId += 1);
  socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  return id;
}

function startKeepAlive(state: CirclesWssState) {
  stopKeepAlive(state);
  state.keepAliveTimer = setInterval(() => {
    // A cheap request keeps idle proxies from dropping the socket. The reply id
    // matches neither the subscription nor the subscribe request, so it is
    // ignored by handleSocketMessage.
    sendRpc(state, "eth_blockNumber", []);
  }, WSS_KEEPALIVE_MS);

  const handle = state.keepAliveTimer as unknown as { unref?: () => void };
  handle.unref?.();
}

function stopKeepAlive(state: CirclesWssState) {
  if (state.keepAliveTimer) {
    clearInterval(state.keepAliveTimer);
    state.keepAliveTimer = null;
  }
}

function handleSocketMessage(state: CirclesWssState, data: unknown) {
  let payload: JsonRpcMessage;

  try {
    payload = JSON.parse(typeof data === "string" ? data : String(data)) as JsonRpcMessage;
  } catch {
    return;
  }

  // Response to our eth_subscribe call: capture the subscription id.
  if (payload.id !== undefined && payload.id === state.subscribeRequestId) {
    if (typeof payload.result === "string") {
      state.subscriptionId = payload.result;
    } else if (payload.error) {
      state.lastError = `eth_subscribe failed: ${payload.error.message ?? "unknown error"}`;
    }
    return;
  }

  // Live log notification.
  if (payload.method === "eth_subscription" && payload.params?.subscription === state.subscriptionId) {
    const event = logToTransferEvent(payload.params.result);

    if (event) {
      handleCirclesEvent(state, event);
    }
  }
}

function subscribeToOrgTransfers(state: CirclesWssState) {
  const env = getEnv();
  const hubAddress = normalizeAddress(getRuntimeCirclesConfig().v2HubAddress);
  const orgTopic = toAddressTopic(env.CIRCLES_ORG_ADDRESS);

  state.subscribeRequestId = sendRpc(state, "eth_subscribe", [
    "logs",
    {
      address: hubAddress,
      // Hub ERC-1155 TransferSingle/TransferBatch where topic[3] (the recipient)
      // is the org address. This catches both direct and path/flow transfers,
      // including those wrapped in an ERC-4337 UserOperation.
      topics: [[TRANSFER_SINGLE_TOPIC, TRANSFER_BATCH_TOPIC], null, null, orgTopic],
    },
  ]);
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
    console.warn(`[circles-wss] payment watcher disabled: ${listenerConfig.reason}`);
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
    const wsUrl = getChainWsUrl(env.CIRCLES_RPC_URL);
    const socket = new WebSocket(wsUrl);
    state.socket = socket;
    state.subscriptionId = null;
    state.subscribeRequestId = null;

    const connectTimeout = setTimeout(() => {
      if (state.status === "connecting") {
        state.lastError = `Circles chain WebSocket did not open within ${WSS_CONNECT_TIMEOUT_MS}ms.`;
        try {
          socket.close();
        } catch {
          // ignore — onclose drives the reconnect.
        }
      }
    }, WSS_CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      clearTimeout(connectTimeout);
      state.status = "open";
      state.lastError = null;
      state.reconnectAttempt = 0;
      subscribeToOrgTransfers(state);
      startKeepAlive(state);
      console.info(`[circles-wss] payment watcher connected to ${wsUrl} for ${env.CIRCLES_ORG_ADDRESS}`);
      // Catch any payment that landed while the socket was down.
      scheduleReconcile(state, "startup", 0);
    };

    socket.onmessage = (message: MessageEvent) => handleSocketMessage(state, message.data);

    socket.onerror = () => {
      state.lastError = "Circles chain WebSocket error.";
    };

    socket.onclose = () => {
      clearTimeout(connectTimeout);
      stopKeepAlive(state);
      state.socket = null;
      state.subscriptionId = null;
      state.subscribeRequestId = null;

      if (state.status === "disabled") {
        return;
      }

      state.status = "closed";
      console.warn("[circles-wss] payment watcher socket closed, will retry.");
      scheduleReconnect(state);
    };
  } catch (error) {
    state.socket = null;
    state.status = "closed";
    state.lastError = getErrorMessage(error);
    console.warn(`[circles-wss] payment watcher connection failed, will retry: ${state.lastError}`);
    scheduleReconnect(state);
  }
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
