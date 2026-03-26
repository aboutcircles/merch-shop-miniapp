import "server-only";

import { getEnv } from "@/lib/env";
import { NextResponse } from "next/server";

function decodeBasicAuth(headers: Headers) {
  const header = headers.get("authorization");

  if (!header?.startsWith("Basic ")) {
    return null;
  }

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex < 0) {
    return null;
  }

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
}

export function isInternalRequest(headers: Headers) {
  const env = getEnv();
  return headers.get("x-internal-token") === env.INTERNAL_API_TOKEN;
}

export function isAdminRequest(headers: Headers) {
  const env = getEnv();
  const credentials = decodeBasicAuth(headers);

  if (!credentials) {
    return false;
  }

  return (
    credentials.username === env.ADMIN_USERNAME && credentials.password === env.ADMIN_PASSWORD
  );
}

export function getAdminIdentity(headers: Headers) {
  const credentials = decodeBasicAuth(headers);
  return credentials?.username ?? "admin";
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Unauthorized" },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="admin"',
      },
    },
  );
}

export function forbiddenResponse(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}
