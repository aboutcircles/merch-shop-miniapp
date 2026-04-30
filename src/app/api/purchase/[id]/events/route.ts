import { NextResponse } from "next/server";

import { purchaseStatusQuerySchema } from "@/lib/validation";
import { ensureCirclesPaymentWatcher } from "@/server/services/circles-wss-listener";
import { getPurchaseSnapshot, verifyAndProcessPurchase } from "@/server/services/payment-service";
import {
  getPublishedPurchaseSnapshot,
  subscribeToPurchaseSnapshots,
} from "@/server/services/purchase-events";
import type { PurchaseSnapshot } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

function encodeSseData(snapshot: PurchaseSnapshot) {
  return `data: ${JSON.stringify(snapshot)}\n\n`;
}

function isAwaitingPayment(snapshot: PurchaseSnapshot) {
  return snapshot.paymentStatus === "awaiting_payment";
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const parsed = purchaseStatusQuerySchema.parse({
      ticket: url.searchParams.get("ticket"),
      txHash: url.searchParams.get("txHash") ?? undefined,
    });
    const initialSnapshot = await getPurchaseSnapshot(parsed.ticket, parsed.txHash);

    if (initialSnapshot.purchaseId !== id) {
      return NextResponse.json({ error: "Purchase id mismatch." }, { status: 400 });
    }

    ensureCirclesPaymentWatcher();

    const encoder = new TextEncoder();
    let cleanup: () => void = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let expiryTimer: ReturnType<typeof setTimeout> | null = null;
        let lastPayload = "";

        function enqueue(value: string) {
          if (closed) {
            return;
          }

          try {
            controller.enqueue(encoder.encode(value));
          } catch {
            cleanup();
          }
        }

        function scheduleExpiryRefresh(snapshot: PurchaseSnapshot) {
          if (expiryTimer) {
            clearTimeout(expiryTimer);
            expiryTimer = null;
          }

          if (!isAwaitingPayment(snapshot)) {
            return;
          }

          const expiresAt = new Date(snapshot.expiresAt).getTime();
          const delayMs = Math.max(0, expiresAt - Date.now() + 1_000);

          expiryTimer = setTimeout(() => {
            void sendVerifiedSnapshot();
          }, delayMs);
        }

        function sendSnapshot(snapshot: PurchaseSnapshot) {
          const payload = encodeSseData(snapshot);

          if (payload === lastPayload) {
            return;
          }

          lastPayload = payload;
          enqueue(payload);
          scheduleExpiryRefresh(snapshot);
        }

        async function sendVerifiedSnapshot() {
          try {
            const snapshot = await verifyAndProcessPurchase(parsed.ticket, parsed.txHash);

            if (snapshot.purchaseId === id) {
              sendSnapshot(snapshot);
            }
          } catch {
            enqueue("event: error\ndata: Unable to refresh purchase status.\n\n");
          }
        }

        const unsubscribe = subscribeToPurchaseSnapshots(id, sendSnapshot);
        const heartbeat = setInterval(() => enqueue(": keep-alive\n\n"), 25_000);

        cleanup = () => {
          if (closed) {
            return;
          }

          closed = true;
          unsubscribe();
          clearInterval(heartbeat);

          if (expiryTimer) {
            clearTimeout(expiryTimer);
          }
        };

        request.signal.addEventListener("abort", cleanup, { once: true });
        sendSnapshot(getPublishedPurchaseSnapshot(id) ?? initialSnapshot);
        void sendVerifiedSnapshot();
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to stream purchase status.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
