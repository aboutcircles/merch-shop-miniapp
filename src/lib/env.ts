import "server-only";

import { z } from "zod";

const envSchema = z.object({
  ADMIN_PASSWORD: z.string().min(1),
  ADMIN_USERNAME: z.string().min(1),
  CIRCLES_CHAIN_ID: z.coerce.number().int().default(100),
  CIRCLES_ORG_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  CIRCLES_RPC_URL: z.string().url().default("https://rpc.aboutcircles.com"),
  CIRCLES_TREASURY_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  CIRCLES_TREASURY_SAFE_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  INTERNAL_API_TOKEN: z.string().min(16),
  PAYMENT_SESSION_MINUTES: z.coerce.number().int().min(5).max(120).default(5),
  PURCHASE_SIGNING_SECRET: z.string().min(32),
  SITE_URL: z.string().url().default("http://localhost:3000"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

function readRawEnv() {
  return {
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    CIRCLES_CHAIN_ID: process.env.CIRCLES_CHAIN_ID,
    CIRCLES_ORG_ADDRESS: process.env.CIRCLES_ORG_ADDRESS,
    CIRCLES_RPC_URL: process.env.CIRCLES_RPC_URL,
    CIRCLES_TREASURY_PRIVATE_KEY: process.env.CIRCLES_TREASURY_PRIVATE_KEY,
    CIRCLES_TREASURY_SAFE_ADDRESS: process.env.CIRCLES_TREASURY_SAFE_ADDRESS,
    INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN,
    PAYMENT_SESSION_MINUTES: process.env.PAYMENT_SESSION_MINUTES,
    PURCHASE_SIGNING_SECRET: process.env.PURCHASE_SIGNING_SECRET,
    SITE_URL: process.env.SITE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
  };
}

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(readRawEnv());
  }

  return cachedEnv;
}
