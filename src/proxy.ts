import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const protectedPrefixes = ["/admin", "/api/admin", "/api/payout"];

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const authorization = request.headers.get("authorization");
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!authorization?.startsWith("Basic ") || !username || !password) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="admin"',
      },
    });
  }

  const decoded = atob(authorization.slice(6));
  const [providedUsername, providedPassword] = decoded.split(":");

  if (providedUsername !== username || providedPassword !== password) {
    return new NextResponse("Access denied.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="admin"',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/payout"],
};
