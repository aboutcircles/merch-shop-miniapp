import { NextResponse } from "next/server";

import { deleteMerchItem, listMerchItems, updateMerchPricing, upsertMerchItem } from "@/lib/merch-store";
import { deleteMerchItemSchema, updateMerchPricingSchema, upsertMerchItemSchema } from "@/lib/validation";

export async function GET() {
  const items = await listMerchItems();

  return NextResponse.json({
    items,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const pricingOnlyPayload = updateMerchPricingSchema.safeParse(body);
    const productPayload = upsertMerchItemSchema.safeParse(body);
    const looksLikeProductUpdate =
      typeof body === "object" &&
      body !== null &&
      ["name", "image", "tag", "stock", "isActive"].some((key) => key in body);

    if (productPayload.success) {
      await upsertMerchItem(productPayload.data);
    } else if (looksLikeProductUpdate) {
      throw new Error(productPayload.error.issues[0]?.message ?? "Invalid merch item.");
    } else if (pricingOnlyPayload.success) {
      await updateMerchPricing(pricingOnlyPayload.data);
    } else {
      throw new Error(productPayload.error.issues[0]?.message ?? "Invalid merch item.");
    }

    return NextResponse.json({
      items: await listMerchItems(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update merch item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = deleteMerchItemSchema.parse(await request.json());
    const items = await deleteMerchItem(payload);

    return NextResponse.json({
      items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete merch item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
