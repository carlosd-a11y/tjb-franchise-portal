import { describe, expect, it } from "vitest";
import { createDemoDatabase, type DemoStorage } from "../../src/demo/database";
import { normalizeAddress } from "../../src/lib/normalize";
import { matchRejectionHits } from "../../src/lib/rejectionHits";
import type { RejectionRecord, UserProfile } from "../../src/types";

function memory(): DemoStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const alex: UserProfile = {
  uid: "uid-alex",
  email: "alex@tropicaljuice.test",
  name: "Alex Rivera",
  role: "franchisee",
  active: true,
};

describe("demo database", () => {
  it("seeds fictional data, claims, fuzzy-dedupes, and resets", () => {
    const db = createDemoDatabase(memory());
    const harbor = db.location("loc-harbor");
    expect(harbor?.status).toBe("pool");
    expect(harbor?.normalizedAddress).toBe(normalizeAddress("100 Demo Harbor Drive", "Miami", "FL", "33139"));
    const hits = db.rejectionHits(harbor!.normalizedAddress, harbor!.zip);
    expect(hits.some((hit) => hit.match === "zip")).toBe(true);

    db.claim("loc-bay", alex);
    expect(db.location("loc-bay")?.status).toBe("claimed");
    expect(db.location("loc-bay")?.claimedByName).toBe("Alex Rivera");

    expect(() =>
      db.create(alex, {
        address: "200 Sample Bay Road",
        city: "Tampa",
        state: "FL",
        zip: "33602",
        normalizedAddress: normalizeAddress("200 Sample Bay Road", "Tampa", "FL", "33602"),
        lat: null,
        lng: null,
        sqft: 1100,
        rent: 5400,
      }),
    ).toThrow(/already in the list/);

    db.reset();
    expect(db.location("loc-bay")?.status).toBe("pool");
  });
});

describe("demo address edit", () => {
  it("fixes an address in place and keeps the claim", () => {
    const db = createDemoDatabase(memory());
    db.claim("loc-bay", alex);
    const before = db.location("loc-bay")!;
    const fixed = {
      address: "202 Sample Bay Road",
      city: "Tampa",
      state: "FL",
      zip: "33602",
      normalizedAddress: normalizeAddress("202 Sample Bay Road", "Tampa", "FL", "33602"),
    };
    db.updateAddress("loc-bay", fixed);
    const after = db.location("loc-bay")!;
    expect(after.address).toBe("202 Sample Bay Road");
    expect(after.normalizedAddress).toBe(fixed.normalizedAddress);
    expect(after.status).toBe("claimed");
    expect(after.claimedBy).toBe(alex.uid);
    expect(after.lastActivityAt.toDate().getTime()).toBe(before.lastActivityAt.toDate().getTime());

    const harbor = db.location("loc-harbor")!;
    expect(() =>
      db.updateAddress("loc-bay", {
        address: harbor.address,
        city: harbor.city,
        state: harbor.state,
        zip: harbor.zip,
        normalizedAddress: harbor.normalizedAddress,
      }),
    ).toThrow(/already in the list/);
  });
});

describe("rejection hits", () => {
  const rows = [
    {
      id: "a",
      address: "100 Main Street",
      city: "Miami",
      state: "FL",
      zip: "33139",
      normalizedAddress: "100 main street|miami|fl|33139",
      rejectedBy: "Import",
      rejectedAt: { toDate: () => new Date("2024-01-01") },
      reasonCode: "rent",
      reasonText: "FAKE",
    },
    {
      id: "z",
      address: "8 Mythic Blvd",
      city: "Miami",
      state: "FL",
      zip: "33139",
      normalizedAddress: "8 mythic boulevard|miami|fl|33139",
      rejectedBy: "Import",
      rejectedAt: { toDate: () => new Date("2024-02-01") },
      reasonCode: "visibility",
      reasonText: "FAKE zip",
    },
  ] as RejectionRecord[];

  it("keeps a ZIP warning when the street does not match", () => {
    const hits = matchRejectionHits(rows, "100 main street|miami|fl|33139", "33139");
    expect(hits.map((hit) => hit.match).sort()).toEqual(["address", "zip"]);
    const zipOnly = matchRejectionHits(rows, "9 other road|miami|fl|33139", "33139");
    expect(zipOnly.every((hit) => hit.match === "zip")).toBe(true);
    expect(zipOnly.length).toBe(2);
  });
});
