import { NextResponse } from "next/server";

import { purchaseStatusQuerySchema } from "@/lib/validation";
import { getPurchaseSnapshot } from "@/server/services/payment-service";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const parsed = purchaseStatusQuerySchema.parse({
      ticket: url.searchParams.get("ticket"),
      txHash: url.searchParams.get("txHash") ?? undefined,
    });
    const snapshot = await getPurchaseSnapshot(parsed.ticket, parsed.txHash);

    if (snapshot.purchaseId !== id) {
      return NextResponse.json({ error: "Purchase id mismatch." }, { status: 400 });
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch purchase.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
