import { NextResponse } from "next/server";

import { forbiddenResponse, isAdminRequest, isInternalRequest, unauthorizedResponse } from "@/lib/auth";
import { reconcileSchema } from "@/lib/validation";
import { reconcilePurchases } from "@/server/services/reconcile-service";

export async function POST(request: Request) {
  if (!isInternalRequest(request.headers) && !isAdminRequest(request.headers)) {
    return request.headers.get("authorization") ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const bodyText = await request.text();
    const payload = reconcileSchema.parse(bodyText ? JSON.parse(bodyText) : {});
    const purchases = await reconcilePurchases(payload.tickets);

    return NextResponse.json({
      count: purchases.length,
      purchases,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reconcile purchases.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
