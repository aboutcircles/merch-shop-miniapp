import "server-only";

import { decodeCrcV2TransferData, encodeCrcV2TransferData } from "@aboutcircles/sdk-utils";

const TEXT_TRANSFER_DATA_TYPE = 0x0001;

function normalizeString(value: string) {
  return value.trim().toLowerCase();
}

function normalizeHex(value: string): string | null {
  const trimmed = normalizeString(value);

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("\\x")) {
    return `0x${trimmed.slice(2)}`;
  }

  if (trimmed.startsWith("0x")) {
    return trimmed;
  }

  if (/^[0-9a-f]+$/i.test(trimmed)) {
    return `0x${trimmed}`;
  }

  return null;
}

function utf8ToHex(value: string) {
  return Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToUtf8(hexValue: string): string | null {
  try {
    const normalized = hexValue.startsWith("0x") ? hexValue.slice(2) : hexValue;

    if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(normalized)) {
      return null;
    }

    const bytes = new Uint8Array(normalized.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function decodedPayloadMatchesReference(payload: unknown, reference: string) {
  const target = normalizeString(reference);

  if (typeof payload === "string") {
    return normalizeString(payload) === target;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return normalizeString(payload.message) === target;
  }

  return false;
}

export function encodePaymentReferenceTransferData(reference: string) {
  return encodeCrcV2TransferData([reference], TEXT_TRANSFER_DATA_TYPE);
}

export function calldataContainsReference(calldata: string, reference: string) {
  if (!reference) {
    return false;
  }

  const haystack = calldata.trim().toLowerCase();

  if (!haystack || haystack === "0x") {
    return false;
  }

  // The payment reference is embedded verbatim in the transaction calldata as a
  // Circles transfer-data annotation (and, defensively, as its raw UTF-8 bytes),
  // regardless of how the payer's wallet wraps the call (direct ERC-1155
  // transfer, Safe execTransaction, or flow-matrix path transfer). Locating it
  // in the calldata lets us confirm the payment immediately, without waiting for
  // the indexer to expose the CrcV2_TransferData event.
  const annotationHex = encodePaymentReferenceTransferData(reference).replace(/^0x/i, "").toLowerCase();
  const utf8Hex = utf8ToHex(reference).toLowerCase();

  return haystack.includes(annotationHex) || haystack.includes(utf8Hex);
}

export function transferDataMatchesReference(dataField: string, reference: string) {
  const target = normalizeString(reference);

  if (!target) {
    return false;
  }

  const targetHex = utf8ToHex(target);
  const encodedReference = normalizeString(encodePaymentReferenceTransferData(reference));
  const candidates = new Set<string>([target, targetHex, `0x${targetHex}`, encodedReference]);

  if (target.startsWith("0x")) {
    candidates.add(target.slice(2));
  }

  const eventRaw = normalizeString(dataField);

  if (candidates.has(eventRaw)) {
    return true;
  }

  const eventHex = normalizeHex(eventRaw);

  if (!eventHex) {
    return false;
  }

  if (candidates.has(eventHex) || candidates.has(eventHex.slice(2))) {
    return true;
  }

  try {
    const decoded = decodeCrcV2TransferData(eventHex);

    if (decoded.type === TEXT_TRANSFER_DATA_TYPE && decodedPayloadMatchesReference(decoded.payload, reference)) {
      return true;
    }
  } catch {
    // Fall through to legacy raw UTF-8 matching below.
  }

  const eventUtf8 = hexToUtf8(eventHex);
  return eventUtf8 ? candidates.has(normalizeString(eventUtf8)) : false;
}
