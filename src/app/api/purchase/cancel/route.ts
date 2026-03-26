import { NextResponse } from "next/server";

import { markPurchaseCancelled } from "@/lib/idempotency";
import { cancelPurchaseSchema } from "@/lib/validation";
import { getPurchaseSnapshot } from "@/server/services/payment-service";

export async function POST(request: Request) {
  try {
    const payload = cancelPurchaseSchema.parse(await request.json());
    const snapshot = await getPurchaseSnapshot(payload.ticket);

    if (snapshot.paymentStatus === "paid") {
      return NextResponse.json({ error: "Paid purchases cannot be cancelled." }, { status: 400 });
    }

    await markPurchaseCancelled(snapshot.purchaseId);

    return NextResponse.json({
      ok: true,
      purchaseId: snapshot.purchaseId,
      paymentStatus: "cancelled",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel purchase.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
