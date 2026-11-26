import type { RejectionHit, RejectionRecord } from "../types";

/** Address hits win. A different address in the same ZIP is still a ZIP warning. */
export function matchRejectionHits(
  rows: RejectionRecord[],
  normalizedAddress: string,
  zip: string,
): RejectionHit[] {
  const hits: RejectionHit[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.normalizedAddress !== normalizedAddress) continue;
    seen.add(row.id);
    hits.push({
      id: row.id,
      reasonCode: row.reasonCode,
      reasonText: row.reasonText,
      match: "address",
      city: row.city,
      state: row.state,
      zip: row.zip,
    });
  }
  for (const row of rows) {
    if (seen.has(row.id) || row.zip !== zip || row.normalizedAddress === normalizedAddress) continue;
    hits.push({
      id: row.id,
      reasonCode: row.reasonCode,
      reasonText: row.reasonText,
      match: "zip",
      city: row.city,
      state: row.state,
      zip: row.zip,
    });
    if (hits.length >= 10) break;
  }
  return hits.slice(0, 10);
}
