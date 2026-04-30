import "server-only";

import { withKeyLock } from "@/lib/idempotency";
import { getSupabaseClient } from "@/lib/supabase";
import {
  deleteMerchItemSchema,
  merchItemsFileSchema,
  merchItemSchema,
  updateMerchPricingSchema,
  upsertMerchItemSchema,
} from "@/lib/validation";
import type { MerchItem, MerchPricingRecord } from "@/types";

const MERCH_ITEM_SELECT =
  "id, slug, name, image, tag, stock, is_active, display_order, price_crc, min_price_crc, max_price_crc, created_at, updated_at";

type MerchItemRow = {
  id: string;
  slug: string;
  name: string;
  image: string;
  tag: string;
  stock: number;
  is_active: boolean;
  display_order: number;
  price_crc: string;
  min_price_crc: string;
  max_price_crc: string;
  created_at: string;
  updated_at: string;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

function shouldUseLocalEmptyCatalogFallback() {
  return (
    process.env.NODE_ENV === "development" &&
    (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

function isMissingRelationError(error: SupabaseErrorLike | null) {
  return error?.code === "42P01" || error?.message?.includes("does not exist") === true;
}

function sortMerchItems(items: MerchItem[]) {
  return [...items].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}

function slugifyProductName(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "product";
}

function getNextDisplayOrder(items: MerchItem[]) {
  return items.length ? Math.max(...items.map((item) => item.displayOrder)) + 10 : 10;
}

function getUniqueSlug(baseSlug: string, items: MerchItem[]) {
  const existingSlugs = new Set(items.map((item) => item.slug));

  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${baseSlug}-${suffix}`;

    if (!existingSlugs.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique product slug.");
}

function mapMerchItemRow(row: MerchItemRow): MerchItem {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    image: row.image,
    tag: row.tag,
    stock: Number(row.stock),
    isActive: Boolean(row.is_active),
    displayOrder: Number(row.display_order),
    priceCrc: row.price_crc,
    minPriceCrc: row.min_price_crc,
    maxPriceCrc: row.max_price_crc,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMerchItemToRow(item: MerchItem) {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    image: item.image,
    tag: item.tag,
    stock: item.stock,
    is_active: item.isActive,
    display_order: item.displayOrder,
    price_crc: item.priceCrc,
    min_price_crc: item.minPriceCrc,
    max_price_crc: item.maxPriceCrc,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function toPricingRecords(items: MerchItem[]): MerchPricingRecord[] {
  return items.map((item) => ({
    id: item.id,
    priceCrc: item.priceCrc,
    minPriceCrc: item.minPriceCrc,
    maxPriceCrc: item.maxPriceCrc,
  }));
}

function buildProductId(slug: string) {
  return `merch_${slug.replaceAll("-", "_")}`;
}

async function upsertMerchRows(items: MerchItem[]) {
  if (!items.length) {
    return;
  }

  const client = getSupabaseClient();
  const { error } = await client.from("merch_items").upsert(
    items.map((item) => mapMerchItemToRow(item)),
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(`Unable to persist merch items: ${error.message}`);
  }
}

async function readMerchItemsFromSupabase(): Promise<MerchItem[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("merch_items")
    .select(MERCH_ITEM_SELECT)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) {
      throw new Error("Missing Supabase table merch_items. Run the latest README schema migration.");
    }

    throw new Error(`Unable to load merch items: ${error.message}`);
  }

  const items = sortMerchItems((data ?? []).map((row) => mapMerchItemRow(row as MerchItemRow)));
  const parsed = merchItemsFileSchema.safeParse(items);

  if (!parsed.success) {
    throw new Error("Merch item data in Supabase is invalid.");
  }

  return parsed.data;
}

export async function listMerchItems(): Promise<MerchItem[]> {
  if (shouldUseLocalEmptyCatalogFallback()) {
    return [];
  }

  return readMerchItemsFromSupabase();
}

export async function getMerchItemById(id: string) {
  const items = await listMerchItems();
  return items.find((item) => item.id === id);
}

export async function listMerchPricing() {
  return toPricingRecords(await listMerchItems());
}

export async function updateMerchPricing(input: MerchPricingRecord) {
  const payload = updateMerchPricingSchema.parse(input);

  return withKeyLock("merch-items", async () => {
    const items = await readMerchItemsFromSupabase();
    const existing = items.find((item) => item.id === payload.id);

    if (!existing) {
      throw new Error("Merch item pricing was not found.");
    }

    await upsertMerchRows([
      {
        ...existing,
        priceCrc: payload.priceCrc,
        minPriceCrc: payload.minPriceCrc,
        maxPriceCrc: payload.maxPriceCrc,
        updatedAt: new Date().toISOString(),
      },
    ]);

    return toPricingRecords(await readMerchItemsFromSupabase());
  });
}

export async function upsertMerchItem(input: unknown) {
  const payload = upsertMerchItemSchema.parse(input);

  return withKeyLock("merch-items", async () => {
    const items = await readMerchItemsFromSupabase();
    const existingItem = payload.id ? items.find((item) => item.id === payload.id) : undefined;
    const slug = existingItem?.slug ?? getUniqueSlug(slugifyProductName(payload.name), items);
    const id = existingItem?.id ?? payload.id?.trim() ?? buildProductId(slug);
    const existing = existingItem ?? items.find((item) => item.id === id);
    const slugOwner = items.find((item) => item.slug === slug && item.id !== id);

    if (slugOwner) {
      throw new Error("Another merch item already uses this slug.");
    }

    const now = new Date().toISOString();
    const nextItem: MerchItem = {
      id,
      slug,
      name: payload.name,
      image: payload.image,
      tag: payload.tag,
      stock: payload.stock,
      isActive: payload.isActive,
      displayOrder: existing?.displayOrder ?? getNextDisplayOrder(items),
      priceCrc: payload.priceCrc,
      minPriceCrc: payload.minPriceCrc,
      maxPriceCrc: payload.maxPriceCrc,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const parsedItem = merchItemSchema.parse(nextItem);
    await upsertMerchRows([parsedItem]);

    return readMerchItemsFromSupabase();
  });
}

export async function deleteMerchItem(input: unknown) {
  const { id } = deleteMerchItemSchema.parse(input);

  return withKeyLock("merch-items", async () => {
    const client = getSupabaseClient();
    const { error } = await client.from("merch_items").delete().eq("id", id);

    if (error) {
      throw new Error(`Unable to delete merch item: ${error.message}`);
    }

    return readMerchItemsFromSupabase();
  });
}
