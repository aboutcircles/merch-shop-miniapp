import "server-only";

import { defaultMerchPricing, merchCatalog } from "@/data/merch";
import { withKeyLock } from "@/lib/idempotency";
import { getSupabaseClient } from "@/lib/supabase";
import { merchPricingFileSchema, updateMerchPricingSchema } from "@/lib/validation";
import type { MerchItem, MerchPricingRecord } from "@/types";

function getDefaultPricingMap() {
  return new Map(defaultMerchPricing.map((entry) => [entry.id, entry]));
}

function assertKnownMerchItem(id: string) {
  if (!merchCatalog.some((item) => item.id === id)) {
    throw new Error("Merch item pricing was not found.");
  }
}

async function upsertPricingRecords(records: MerchPricingRecord[]) {
  if (!records.length) {
    return;
  }

  const client = getSupabaseClient();
  const { error } = await client.from("merch_pricing").upsert(
    records.map((record) => ({
      id: record.id,
      price_crc: record.priceCrc,
      min_price_crc: record.minPriceCrc,
      max_price_crc: record.maxPriceCrc,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(`Unable to persist merch pricing: ${error.message}`);
  }
}

async function readPricingRecords(): Promise<MerchPricingRecord[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("merch_pricing")
    .select("id, price_crc, min_price_crc, max_price_crc");

  if (error) {
    throw new Error(`Unable to load merch pricing: ${error.message}`);
  }

  const parsed = merchPricingFileSchema.safeParse(
    (data ?? []).map((row) => ({
      id: row.id,
      priceCrc: row.price_crc,
      minPriceCrc: row.min_price_crc,
      maxPriceCrc: row.max_price_crc,
    })),
  );

  if (!parsed.success) {
    throw new Error("Merch pricing data in Supabase is invalid.");
  }

  const defaults = getDefaultPricingMap();
  const present = new Set(parsed.data.map((entry) => entry.id));
  const missingDefaults = merchCatalog
    .filter((item) => !present.has(item.id))
    .map((item) => defaults.get(item.id)!);

  if (missingDefaults.length) {
    await upsertPricingRecords(missingDefaults);
  }

  return merchCatalog.map((item) => parsed.data.find((entry) => entry.id === item.id) ?? defaults.get(item.id)!);
}

export async function listMerchItems(): Promise<MerchItem[]> {
  const pricing = await readPricingRecords();
  const pricingMap = new Map(pricing.map((entry) => [entry.id, entry]));

  return merchCatalog.map((item) => {
    const currentPricing = pricingMap.get(item.id) ?? getDefaultPricingMap().get(item.id)!;

    return {
      ...item,
      priceCrc: currentPricing.priceCrc,
      minPriceCrc: currentPricing.minPriceCrc,
      maxPriceCrc: currentPricing.maxPriceCrc,
    };
  });
}

export async function getMerchItemById(id: string) {
  const items = await listMerchItems();
  return items.find((item) => item.id === id);
}

export async function listMerchPricing() {
  return readPricingRecords();
}

export async function updateMerchPricing(input: MerchPricingRecord) {
  const payload = updateMerchPricingSchema.parse(input);
  assertKnownMerchItem(payload.id);

  return withKeyLock("merch-pricing", async () => {
    await upsertPricingRecords([payload]);
    return readPricingRecords();
  });
}
