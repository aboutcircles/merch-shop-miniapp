import { clsx, type ClassValue } from "clsx";
import { formatUnits, parseUnits } from "viem";
import { twMerge } from "tailwind-merge";

export const CRC_DECIMALS = 18;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCrc(value: string | bigint, maximumFractionDigits = 4) {
  const raw = typeof value === "bigint" ? formatUnits(value, CRC_DECIMALS) : value;
  const amount = Number(raw);

  if (Number.isNaN(amount)) {
    return raw;
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(amount);
}

export function toAttoCrc(value: string) {
  return parseUnits(value, CRC_DECIMALS);
}

export function fromAttoCrc(value: string | bigint) {
  return formatUnits(typeof value === "bigint" ? value : BigInt(value), CRC_DECIMALS);
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatRelativeCountdown(expiresAt: string) {
  return formatRelativeCountdownAt(expiresAt, Date.now());
}

export function formatRelativeCountdownAt(expiresAt: string, now: number) {
  const remainingMs = new Date(expiresAt).getTime() - now;

  if (remainingMs <= 0) {
    return "Expired";
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function shortenAddress(address: string, size = 4) {
  return `${address.slice(0, 2 + size)}…${address.slice(-size)}`;
}

export function isHexAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
