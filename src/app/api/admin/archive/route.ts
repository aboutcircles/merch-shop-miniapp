import { NextResponse } from "next/server";

import { archiveCompletedPurchases } from "@/lib/idempotency";
import { archivePurchasesSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const bodyText = await request.text();
    const payload = archivePurchasesSchema.parse(bodyText ? JSON.parse(bodyText) : {});
    const beforeIso = new Date(Date.now() - payload.beforeDays * 24 * 60 * 60 * 1000).toISOString();
    const result = await archiveCompletedPurchases(beforeIso, payload.limit);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to archive purchases.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
