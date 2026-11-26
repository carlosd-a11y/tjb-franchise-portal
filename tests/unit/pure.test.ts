import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRejectionCsv } from "../../src/lib/csv";
import { matchesLocation } from "../../src/lib/filters";
import { CLAIM_WINDOW_MS, REASON_CODES } from "../../src/lib/model";
import { normalizeAddress } from "../../src/lib/normalize";
import { daysLeft, isClaimable, isStaleClaim } from "../../src/lib/time";
import { parseDraftLocation, parsePassReason } from "../../src/lib/validators";

describe("normalizeAddress", () => {
  const vectors = JSON.parse(readFileSync("tests/fixtures/address-vectors.json", "utf8")) as Array<{
    id: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    normalized: string;
  }>;

  it("matches the shared vectors used by the PHP intake", () => {
    for (const row of vectors) {
      expect(normalizeAddress(row.address, row.city, row.state, row.zip), row.id).toBe(row.normalized);
    }
  });

  it("keeps ZIP warnings separate from the street key", () => {
    const street = normalizeAddress("100 Main St", "Miami", "FL", "33139");
    const other = normalizeAddress("8 Mythic Blvd", "Miami", "FL", "33139");
    expect(street).not.toBe(other);
    expect(street.endsWith("|33139")).toBe(true);
    expect(other.endsWith("|33139")).toBe(true);
  });
});

describe("claim window", () => {
  const last = new Date("2026-01-01T00:00:00.000Z");
  const exactly = new Date(last.getTime() + CLAIM_WINDOW_MS);
  const after = new Date(exactly.getTime() + 1);

  it("treats the 30-day mark the same way the rules do", () => {
    expect(isStaleClaim("claimed", last, exactly)).toBe(false);
    expect(isStaleClaim("claimed", last, after)).toBe(true);
    expect(isClaimable("pool", last, exactly)).toBe(true);
    expect(isClaimable("approved", last, after)).toBe(false);
    expect(daysLeft(last, new Date(last.getTime() + 2 * 24 * 60 * 60 * 1000))).toBe(28);
    expect(daysLeft(last, after)).toBe(0);
  });
});

describe("filters", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");
  const fresh = new Date("2026-05-20T00:00:00.000Z");
  const stale = new Date("2026-04-01T00:00:00.000Z");

  it("includes the open pool and stale claims, and keeps mine to the owner", () => {
    const rows = [
      { id: "a", city: "Miami", status: "pool" as const, claimedBy: null, lastActivityAt: fresh },
      { id: "b", city: "Miami", status: "claimed" as const, claimedBy: "alex", lastActivityAt: fresh },
      { id: "c", city: "Tampa", status: "researching" as const, claimedBy: "jordan", lastActivityAt: stale },
    ];
    const pool = rows.filter((row) => matchesLocation(row, { scope: "pool", status: "any", city: "any" }, "alex", now));
    expect(pool.map((row) => row.id)).toEqual(["a", "c"]);
    const mine = rows.filter((row) => matchesLocation(row, { scope: "mine", status: "any", city: "any" }, "alex", now));
    expect(mine.map((row) => row.id)).toEqual(["b"]);
    const city = rows.filter((row) =>
      matchesLocation(row, { scope: "all", status: "any", city: "Tampa" }, "alex", now),
    );
    expect(city.map((row) => row.id)).toEqual(["c"]);
  });
});

describe("sample rejection csv", () => {
  const text = readFileSync("samples/rejections-sample.csv", "utf8");

  it("is entirely fake and covers every reason code", () => {
    const parsed = parseRejectionCsv(text);
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows.length).toBeGreaterThanOrEqual(REASON_CODES.length);
    for (const row of parsed.rows) {
      expect(row.reasonText).toContain("FAKE");
    }
    expect(new Set(parsed.rows.map((row) => row.reasonCode))).toEqual(new Set(REASON_CODES));
  });
});

describe("draft validation", () => {
  it("rejects a short pass reason and accepts a complete location", () => {
    expect(parsePassReason("no")).toBeNull();
    expect(parsePassReason("Rent jumped before the tour.")).toBe("Rent jumped before the tour.");
    const parsed = parseDraftLocation({
      address: "100 Demo Harbor Dr.",
      city: "Miami",
      state: "fl",
      zip: "33139",
      sqft: "1450",
      rent: "8200",
      lat: "",
      lng: "",
    });
    expect(parsed).toMatchObject({
      value: { state: "FL", zip: "33139", normalizedAddress: "100 demo harbor drive|miami|fl|33139" },
    });
  });
});
