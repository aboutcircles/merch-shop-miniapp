import { NextResponse } from "next/server";

import { listMerchItems } from "@/lib/merch-store";

export async function GET() {
  const items = await listMerchItems();

  return NextResponse.json({
    items: items.filter((item) => item.isActive && item.stock > 0),
  });
}
