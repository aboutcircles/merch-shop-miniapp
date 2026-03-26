import { NextResponse } from "next/server";

import { listMerchItems, updateMerchPricing } from "@/lib/merch-store";
import { updateMerchPricingSchema } from "@/lib/validation";

export async function GET() {
  const items = await listMerchItems();

  return NextResponse.json({
    items,
  });
}

export async function POST(request: Request) {
  try {
    const payload = updateMerchPricingSchema.parse(await request.json());
    await updateMerchPricing(payload);
    const items = await listMerchItems();

    return NextResponse.json({
      items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update merch pricing.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
