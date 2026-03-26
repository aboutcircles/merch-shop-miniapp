import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getEnv } from "@/lib/env";

let cachedClient: SupabaseClient | undefined;

export function getSupabaseClient() {
  if (!cachedClient) {
    const env = getEnv();

    cachedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedClient;
}
