import { z } from "zod";

function isCrcPrice(value: string) {
  return /^\d+(\.\d{1,4})?$/.test(value);
}

function isImageReference(value: string) {
  if (value.startsWith("/") && !value.startsWith("//") && value.length > 1) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function validatePriceRange(
  value: { minPriceCrc: string; priceCrc: string; maxPriceCrc: string },
  context: z.RefinementCtx,
) {
  const min = Number(value.minPriceCrc);
  const price = Number(value.priceCrc);
  const max = Number(value.maxPriceCrc);

  if (min <= 0 || price <= 0 || max <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "CRC prices must be greater than zero.",
    });
  }

  if (min > price || price > max) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Expected minPriceCrc <= priceCrc <= maxPriceCrc.",
    });
  }
}

const crcPriceField = z.string().refine(isCrcPrice, "Invalid CRC price.");
const merchProductShape = {
  id: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase URL slug."),
  name: z.string().trim().min(1).max(120),
  image: z.string().trim().min(1).refine(isImageReference, "Use a local /path or https:// image URL."),
  priceCrc: crcPriceField,
  minPriceCrc: crcPriceField,
  maxPriceCrc: crcPriceField,
  stock: z.coerce.number().int().min(0).max(100_000),
  isActive: z.boolean(),
  tag: z.string().trim().min(1).max(80),
  displayOrder: z.coerce.number().int().min(0).max(1_000_000),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
};

export const purchaseRequestSchema = z.object({
  merchItemId: z.string().min(1),
  selectedAmountCrc: z.string().regex(/^\d+(\.\d{1,4})?$/),
});

export const purchaseStatusQuerySchema = z.object({
  ticket: z.string().min(1),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
});

export const cancelPurchaseSchema = z.object({
  ticket: z.string().min(1),
});

export const verifyPaymentSchema = z.object({
  ticket: z.string().min(1),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
});

export const adminPurchasesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const reconcileSchema = z.object({
  tickets: z.array(z.string().min(1)).max(50).optional(),
});

export const payoutRequestSchema = z.object({
  ticket: z.string().min(1),
});

export const archivePurchasesSchema = z.object({
  beforeDays: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const deleteMerchItemSchema = z.object({
  id: z.string().min(1),
});

export const merchPricingRecordSchema = z
  .object({
    id: z.string().min(1),
    priceCrc: z.string().refine(isCrcPrice, "Invalid default CRC price."),
    minPriceCrc: z.string().refine(isCrcPrice, "Invalid minimum CRC price."),
    maxPriceCrc: z.string().refine(isCrcPrice, "Invalid maximum CRC price."),
  })
  .superRefine(validatePriceRange);

export const merchPricingFileSchema = z.array(merchPricingRecordSchema);

export const updateMerchPricingSchema = merchPricingRecordSchema;

export const merchItemSchema = z.object(merchProductShape).superRefine(validatePriceRange);

export const merchItemsFileSchema = z.array(merchItemSchema);

export const upsertMerchItemSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    name: merchProductShape.name,
    image: merchProductShape.image,
    priceCrc: merchProductShape.priceCrc,
    minPriceCrc: merchProductShape.minPriceCrc,
    maxPriceCrc: merchProductShape.maxPriceCrc,
    stock: merchProductShape.stock,
    isActive: merchProductShape.isActive,
    tag: merchProductShape.tag,
  })
  .superRefine(validatePriceRange);

export const adminTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  kind: z.enum(["all", "payment", "refund"]).default("all"),
  status: z.enum(["all", "pending", "confirmed", "failed"]).default("all"),
  search: z.string().trim().max(120).optional(),
});
