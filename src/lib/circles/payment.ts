import "server-only";

import crypto from "node:crypto";

import type { MerchItem, PurchaseIntent, PurchaseTicketPayload } from "@/types";
import { getEnv } from "@/lib/env";
import { fromAttoCrc, toAttoCrc } from "@/lib/utils";

const PURCHASE_TOKEN_VERSION = 1;

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string) {
  const env = getEnv();
  return crypto.createHmac("sha256", env.PURCHASE_SIGNING_SECRET).update(encodedPayload).digest("base64url");
}

function buildReference(purchaseId: string) {
  return `CRC-${purchaseId.slice(0, 8).toUpperCase()}`;
}

function generatePaymentLink(recipientAddress: string, amountCrc: string, data: string) {
  const encodedData = encodeURIComponent(data);
  return `https://app.gnosis.io/transfer/${recipientAddress}/crc?data=${encodedData}&amount=${amountCrc}`;
}

export function calculateRefundChancePercent(item: MerchItem, selectedAmountCrc: string) {
  const min = Number(item.minPriceCrc);
  const max = Number(item.maxPriceCrc);
  const selected = Number(selectedAmountCrc);

  if (max <= min) {
    return 50;
  }

  const ratio = (selected - min) / (max - min);
  return Math.round(15 + ratio * 70);
}

function buildQrPayload(payload: PurchaseTicketPayload) {
  return generatePaymentLink(payload.receivingAddress, payload.selectedAmountCrc, payload.reference);
}

export function createPurchaseIntent(item: MerchItem, selectedAmountCrc: string): PurchaseIntent {
  const env = getEnv();
  const purchaseId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + env.PAYMENT_SESSION_MINUTES * 60 * 1000,
  ).toISOString();
  const expectedAmountAtto = toAttoCrc(selectedAmountCrc);

  const payload: PurchaseTicketPayload = {
    purchaseId,
    reference: buildReference(purchaseId),
    merchItemId: item.id,
    merchSlug: item.slug,
    merchName: item.name,
    selectedAmountCrc,
    refundChancePercent: calculateRefundChancePercent(item, selectedAmountCrc),
    expectedAmountCrc: fromAttoCrc(expectedAmountAtto),
    expectedAmountAttoCrc: expectedAmountAtto.toString(),
    receivingAddress: env.CIRCLES_ORG_ADDRESS,
    chainId: env.CIRCLES_CHAIN_ID,
    qrPayload: "",
    createdAt,
    expiresAt,
  };

  const qrPayload = buildQrPayload(payload);
  const completedPayload = {
    ...payload,
    qrPayload,
  };
  const encodedPayload = base64UrlEncode(
    JSON.stringify({
      v: PURCHASE_TOKEN_VERSION,
      ...completedPayload,
    }),
  );
  const signature = signPayload(encodedPayload);

  return {
    ...completedPayload,
    ticket: `${encodedPayload}.${signature}`,
  };
}

export function parsePurchaseTicket(ticket: string): PurchaseTicketPayload {
  const [encodedPayload, signature] = ticket.split(".");

  if (!encodedPayload || !signature || signPayload(encodedPayload) !== signature) {
    throw new Error("Invalid purchase ticket.");
  }

  const decoded = JSON.parse(base64UrlDecode(encodedPayload)) as PurchaseTicketPayload & { v?: number };

  if (decoded.v !== PURCHASE_TOKEN_VERSION) {
    throw new Error("Unsupported purchase ticket version.");
  }

  const parsedPayload = {
    purchaseId: decoded.purchaseId,
    reference: decoded.reference,
    merchItemId: decoded.merchItemId,
    merchSlug: decoded.merchSlug,
    merchName: decoded.merchName,
    selectedAmountCrc: decoded.selectedAmountCrc,
    refundChancePercent: decoded.refundChancePercent,
    expectedAmountCrc: decoded.expectedAmountCrc,
    expectedAmountAttoCrc: decoded.expectedAmountAttoCrc,
    receivingAddress: decoded.receivingAddress,
    chainId: decoded.chainId,
    qrPayload: decoded.qrPayload,
    createdAt: decoded.createdAt,
    expiresAt: decoded.expiresAt,
  };

  return {
    ...parsedPayload,
    qrPayload: buildQrPayload(parsedPayload),
  };
}
