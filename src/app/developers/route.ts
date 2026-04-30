import { NextResponse } from "next/server";

import { MINIAPP_DOCS_URL } from "@/lib/site";

export function GET() {
  return NextResponse.redirect(MINIAPP_DOCS_URL, 308);
}
