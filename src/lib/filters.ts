import { ACTIVE_CLAIM_STATUSES } from "./model";
import { isStaleClaim } from "./time";
import type { LocationStatus } from "../types";

export type LocationView = {
  id: string;
  city: string;
  status: LocationStatus;
  claimedBy: string | null;
  lastActivityAt: Date;
};

export type LocationFilter = {
  scope: "all" | "pool" | "mine";
  status: LocationStatus | "any";
  city: string | "any";
};

export function matchesLocation(
  row: LocationView,
  filter: LocationFilter,
  uid: string,
  now = new Date(),
): boolean {
  if (filter.city !== "any" && row.city !== filter.city) return false;
  if (filter.status !== "any" && row.status !== filter.status) return false;
  if (filter.scope === "mine") {
    const mine =
      row.claimedBy === uid && (ACTIVE_CLAIM_STATUSES as string[]).includes(row.status);
    if (!mine) return false;
  }
  if (filter.scope === "pool") {
    const pooled = row.status === "pool" || isStaleClaim(row.status, row.lastActivityAt, now);
    if (!pooled) return false;
  }
  return true;
}
