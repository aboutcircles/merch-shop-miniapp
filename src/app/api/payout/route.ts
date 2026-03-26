import { NextResponse } from "next/server";

import { forbiddenResponse, isAdminRequest, isInternalRequest, unauthorizedResponse } from "@/lib/auth";
import { payoutRequestSchema } from "@/lib/validation";
import { runRefund } from "@/server/services/payout-service";

export async function POST(request: Request) {
  if (!isInternalRequest(request.headers) && !isAdminRequest(request.headers)) {
    return request.headers.get("authorization") ? forbiddenResponse() : unauthorizedResponse();
  }

  try {
    const payload = payoutRequestSchema.parse(await request.json());
    const result = await runRefund(payload.ticket);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to execute payout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
