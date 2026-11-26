import type { Timestamp } from "firebase/firestore";
import { ACTIVE_CLAIM_STATUSES, CLAIM_WINDOW_MS } from "./model";
import type { LocationStatus } from "../types";

export function toDate(value: Timestamp | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  return value.toDate();
}

export function claimRemainingMs(last: Date, now = new Date()): number {
  return last.getTime() + CLAIM_WINDOW_MS - now.getTime();
}

export function isStaleClaim(status: LocationStatus, last: Date, now = new Date()): boolean {
  return (
    (ACTIVE_CLAIM_STATUSES as string[]).includes(status) && claimRemainingMs(last, now) < 0
  );
}

export function isClaimable(status: LocationStatus, last: Date | null, now = new Date()): boolean {
  if (status === "pool") return true;
  if (!last) return false;
  return isStaleClaim(status, last, now);
}

export function daysLeft(last: Date, now = new Date()): number {
  const remaining = claimRemainingMs(last, now);
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / (24 * 60 * 60 * 1000));
}

export function ago(date: Date, now = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatWhen(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
