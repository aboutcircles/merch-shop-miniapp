import { NextResponse } from "next/server";

import { verifyPaymentSchema } from "@/lib/validation";
import { verifyAndProcessPurchase } from "@/server/services/payment-service";

export async function POST(request: Request) {
  try {
    const payload = verifyPaymentSchema.parse(await request.json());
    const snapshot = await verifyAndProcessPurchase(payload.ticket, payload.txHash);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
