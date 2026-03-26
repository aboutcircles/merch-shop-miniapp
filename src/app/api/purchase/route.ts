import { NextResponse } from "next/server";

import { purchaseRequestSchema } from "@/lib/validation";
import { createPurchaseForItem } from "@/server/services/purchase-service";

export async function POST(request: Request) {
  try {
    const payload = purchaseRequestSchema.parse(await request.json());
    const { item, intent } = await createPurchaseForItem(payload.merchItemId, payload.selectedAmountCrc);

    return NextResponse.json({
      item,
      purchase: intent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create purchase.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
