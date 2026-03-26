import { z } from "zod";

function isCrcPrice(value: string) {
  return /^\d+(\.\d{1,4})?$/.test(value);
}

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

export const reconcileSchema = z.object({
  tickets: z.array(z.string().min(1)).max(50).optional(),
});

export const payoutRequestSchema = z.object({
  ticket: z.string().min(1),
});

export const merchPricingRecordSchema = z
  .object({
    id: z.string().min(1),
    priceCrc: z.string().refine(isCrcPrice, "Invalid default CRC price."),
    minPriceCrc: z.string().refine(isCrcPrice, "Invalid minimum CRC price."),
    maxPriceCrc: z.string().refine(isCrcPrice, "Invalid maximum CRC price."),
  })
  .superRefine((value, context) => {
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
  });

export const merchPricingFileSchema = z.array(merchPricingRecordSchema);

export const updateMerchPricingSchema = merchPricingRecordSchema;
