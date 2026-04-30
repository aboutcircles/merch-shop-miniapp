import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const protectedPrefixes = ["/admin", "/api/admin", "/api/payout"];

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function constantTimeStringEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length, 1);
  let mismatch = aBytes.length ^ bBytes.length;

  for (let i = 0; i < length; i += 1) {
    const aByte = i < aBytes.length ? aBytes[i] : 0;
    const bByte = i < bBytes.length ? bBytes[i] : 0;
    mismatch |= aByte ^ bByte;
  }

  return mismatch === 0;
}

function safeAtob(value: string): string | null {
  try {
    return atob(value);
  } catch {
    return null;
  }
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

  const decoded = safeAtob(authorization.slice(6));
  const separatorIndex = decoded ? decoded.indexOf(":") : -1;
  const providedUsername = decoded && separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : "";
  const providedPassword = decoded && separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

  const usernameMatches = constantTimeStringEqual(providedUsername, username);
  const passwordMatches = constantTimeStringEqual(providedPassword, password);

  if (!usernameMatches || !passwordMatches) {
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
