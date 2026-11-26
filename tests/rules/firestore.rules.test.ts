import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { normalizeAddress } from "../../src/lib/normalize";

const hostPort = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
const host = hostPort[0] ?? "127.0.0.1";
const port = Number(hostPort[1] ?? 8080);

let testEnv: RulesTestEnvironment;

const alex = {
  uid: "uid-alex",
  email: "alex@tropicaljuice.test",
  name: "Alex Rivera",
  role: "franchisee",
  active: true,
};
const jordan = {
  uid: "uid-jordan",
  email: "jordan@tropicaljuice.test",
  name: "Jordan Blake",
  role: "franchisee",
  active: true,
};
const avery = {
  uid: "uid-avery",
  email: "admin@tropicaljuice.test",
  name: "Avery Chen",
  role: "admin",
  active: true,
};
const sam = {
  uid: "uid-sam",
  email: "sam@tropicaljuice.test",
  name: "Sam Lee",
  role: "franchisee",
  active: false,
};

function daysAgo(days: number): Timestamp {
  return Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

function baseLocation(overrides: Record<string, unknown> = {}) {
  return {
    address: "100 Demo Harbor Dr",
    city: "Miami",
    state: "FL",
    zip: "33139",
    normalizedAddress: normalizeAddress("100 Demo Harbor Dr", "Miami", "FL", "33139"),
    lat: null,
    lng: null,
    sqft: 1200,
    rent: 5000,
    source: "manual",
    status: "pool",
    claimedBy: null,
    claimedByName: null,
    claimedAt: null,
    lastActivityAt: daysAgo(1),
    createdBy: "uid-alex",
    createdAt: Timestamp.fromDate(new Date("2026-01-15T00:00:00Z")),
    passReason: null,
    ...overrides,
  };
}

function claimPatch(uid: string, name: string) {
  return {
    status: "claimed",
    claimedBy: uid,
    claimedByName: name,
    claimedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
    passReason: null,
  };
}

function passPatch(reason: string | null) {
  return {
    status: "pool",
    claimedBy: null,
    claimedByName: null,
    claimedAt: null,
    lastActivityAt: serverTimestamp(),
    passReason: reason,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-tropical-juice",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host,
      port,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", alex.uid), alex);
    await setDoc(doc(db, "users", jordan.uid), jordan);
    await setDoc(doc(db, "users", avery.uid), avery);
    await setDoc(doc(db, "users", sam.uid), sam);
  });
});

function dbFor(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

async function seedLocation(id: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "locations", id), data);
  });
}

describe("access", () => {
  it("denies an inactive user and an anonymous visitor", async () => {
    await seedLocation("site", baseLocation());
    await assertFails(getDoc(doc(dbFor(sam.uid), "locations", "site")));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "locations", "site")));
  });

  it("allows an active franchisee to read locations but not other users", async () => {
    await seedLocation("site", baseLocation());
    const db = dbFor(alex.uid);
    await assertSucceeds(getDoc(doc(db, "locations", "site")));
    await assertSucceeds(getDoc(doc(db, "users", alex.uid)));
    await assertFails(getDoc(doc(db, "users", avery.uid)));
    await assertFails(getDocs(collection(db, "users")));
    await assertSucceeds(getDocs(collection(dbFor(avery.uid), "users")));
  });

  it("denies a franchisee creating or escalating users", async () => {
    const newbie = {
      uid: "uid-new",
      email: "new.user@tropicaljuice.test",
      name: "New User",
      role: "franchisee",
      active: true,
    };
    await assertFails(setDoc(doc(dbFor(alex.uid), "users", newbie.uid), newbie));
    await assertSucceeds(setDoc(doc(dbFor(avery.uid), "users", newbie.uid), newbie));
    await assertFails(updateDoc(doc(dbFor(avery.uid), "users", avery.uid), { active: false }));
    await assertSucceeds(updateDoc(doc(dbFor(avery.uid), "users", alex.uid), { active: false }));
  });
});

describe("locations", () => {
  it("allows a pool create and denies a pre-claimed or bot-sourced create", async () => {
    const db = dbFor(alex.uid);
    await assertSucceeds(
      setDoc(doc(db, "locations", "created"), {
        ...baseLocation(),
        createdBy: alex.uid,
        createdAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db, "locations", "bad-status"), {
        ...baseLocation({ status: "claimed", claimedBy: alex.uid, claimedByName: alex.name, claimedAt: daysAgo(0) }),
        createdAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db, "locations", "bad-source"), {
        ...baseLocation({ source: "bot:muse" }),
        createdBy: alex.uid,
        createdAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db, "locations", "too-long"), {
        ...baseLocation({ address: "A".repeat(201) }),
        createdBy: alex.uid,
        createdAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
      }),
    );
  });

  it("allows the first claim and denies a double claim on a fresh claim", async () => {
    await seedLocation("pool", baseLocation());
    await assertSucceeds(updateDoc(doc(dbFor(alex.uid), "locations", "pool"), claimPatch(alex.uid, alex.name)));
    await assertFails(updateDoc(doc(dbFor(jordan.uid), "locations", "pool"), claimPatch(jordan.uid, jordan.name)));
  });

  it("denies claiming a fresh claim and allows claiming a stale one", async () => {
    await seedLocation("fresh", baseLocation({
      status: "researching",
      claimedBy: alex.uid,
      claimedByName: alex.name,
      claimedAt: daysAgo(2),
      lastActivityAt: daysAgo(2),
    }));
    await assertFails(updateDoc(doc(dbFor(jordan.uid), "locations", "fresh"), claimPatch(jordan.uid, jordan.name)));

    await seedLocation("stale", baseLocation({
      status: "claimed",
      claimedBy: alex.uid,
      claimedByName: alex.name,
      claimedAt: daysAgo(40),
      lastActivityAt: daysAgo(40),
    }));
    await assertSucceeds(updateDoc(doc(dbFor(jordan.uid), "locations", "stale"), claimPatch(jordan.uid, jordan.name)));
    await assertFails(updateDoc(doc(dbFor(alex.uid), "locations", "stale"), claimPatch(alex.uid, alex.name)));
  });

  it("denies claiming an approved location even when it is old", async () => {
    await seedLocation("done", baseLocation({
      status: "approved",
      claimedBy: alex.uid,
      claimedByName: alex.name,
      claimedAt: daysAgo(40),
      lastActivityAt: daysAgo(40),
    }));
    await assertFails(updateDoc(doc(dbFor(jordan.uid), "locations", "done"), claimPatch(jordan.uid, jordan.name)));
  });

  it("denies a pass without a reason and allows a pass with one", async () => {
    await seedLocation("owned", baseLocation({
      status: "touring",
      claimedBy: alex.uid,
      claimedByName: alex.name,
      claimedAt: daysAgo(3),
      lastActivityAt: daysAgo(3),
    }));
    const owner = dbFor(alex.uid);
    await assertFails(updateDoc(doc(owner, "locations", "owned"), passPatch(null)));
    await assertFails(updateDoc(doc(owner, "locations", "owned"), passPatch("no")));
    await assertFails(updateDoc(doc(dbFor(jordan.uid), "locations", "owned"), passPatch("Too far from our shoppers.")));
    await assertSucceeds(updateDoc(doc(owner, "locations", "owned"), passPatch("Too far from our shoppers.")));
  });

  it("allows the next status and denies skipping ahead", async () => {
    await seedLocation("step", baseLocation({
      status: "claimed",
      claimedBy: alex.uid,
      claimedByName: alex.name,
      claimedAt: daysAgo(1),
      lastActivityAt: daysAgo(1),
    }));
    await assertFails(updateDoc(doc(dbFor(jordan.uid), "locations", "step"), {
      status: "researching",
      lastActivityAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(dbFor(alex.uid), "locations", "step"), {
      status: "submitted",
      lastActivityAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(dbFor(alex.uid), "locations", "step"), {
      status: "researching",
      lastActivityAt: serverTimestamp(),
    }));
  });

  it("lets the owner refresh activity and denies anyone else", async () => {
    await seedLocation("live", baseLocation({
      status: "researching",
      claimedBy: alex.uid,
      claimedByName: alex.name,
      claimedAt: daysAgo(2),
      lastActivityAt: daysAgo(2),
    }));
    await assertFails(updateDoc(doc(dbFor(jordan.uid), "locations", "live"), {
      lastActivityAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(dbFor(alex.uid), "locations", "live"), {
      lastActivityAt: serverTimestamp(),
    }));
  });

  it("denies a franchisee rejecting and allows an admin", async () => {
    await seedLocation("review", baseLocation({
      status: "submitted",
      claimedBy: alex.uid,
      claimedByName: alex.name,
      claimedAt: daysAgo(4),
      lastActivityAt: daysAgo(4),
    }));
    await assertFails(updateDoc(doc(dbFor(alex.uid), "locations", "review"), {
      status: "rejected",
      lastActivityAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(dbFor(alex.uid), "locations", "review"), {
      status: "approved",
      lastActivityAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(dbFor(avery.uid), "locations", "review"), {
      status: "rejected",
      lastActivityAt: serverTimestamp(),
    }));
  });

  it("denies a franchisee delete and allows an admin delete", async () => {
    await seedLocation("gone", baseLocation());
    await assertFails(deleteDoc(doc(dbFor(alex.uid), "locations", "gone")));
    await assertSucceeds(deleteDoc(doc(dbFor(avery.uid), "locations", "gone")));
  });
});

describe("notes, history, and rejections", () => {
  const rejection = {
    address: "123 Fake Palm Ave",
    city: "Sample City",
    state: "FL",
    zip: "00001",
    normalizedAddress: normalizeAddress("123 Fake Palm Ave", "Sample City", "FL", "00001"),
    rejectedBy: "Historical Import",
    rejectedAt: Timestamp.fromDate(new Date("2024-06-01T00:00:00Z")),
    reasonCode: "rent",
    reasonText: "FAKE demo row. Rent was above the cap.",
  };

  it("denies editing someone else's note and allows editing your own", async () => {
    await seedLocation("noted", baseLocation());
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "locations", "noted", "notes", "note1"), {
        text: "Called the broker.",
        authorUid: alex.uid,
        authorName: alex.name,
        createdAt: daysAgo(1),
      });
    });
    await assertFails(updateDoc(doc(dbFor(jordan.uid), "locations", "noted", "notes", "note1"), {
      text: "Changed by someone else.",
    }));
    await assertSucceeds(updateDoc(doc(dbFor(alex.uid), "locations", "noted", "notes", "note1"), {
      text: "Called the broker today.",
    }));
  });

  it("denies a pass history entry without a reason", async () => {
    await seedLocation("owned", baseLocation({
      status: "claimed",
      claimedBy: alex.uid,
      claimedByName: alex.name,
      claimedAt: daysAgo(1),
      lastActivityAt: daysAgo(1),
    }));
    const base = {
      fromStatus: "claimed",
      toStatus: "pool",
      actorUid: alex.uid,
      actorName: alex.name,
      createdAt: serverTimestamp(),
    };
    await assertFails(setDoc(doc(dbFor(alex.uid), "locations", "owned", "history", "pass-bad"), {
      ...base,
      reason: null,
    }));
    await assertSucceeds(setDoc(doc(dbFor(alex.uid), "locations", "owned", "history", "pass-ok"), {
      ...base,
      reason: "The landlord would not return calls.",
    }));
  });

  it("denies a franchisee recording a rejection and allows an admin", async () => {
    await assertFails(setDoc(doc(dbFor(alex.uid), "rejections", "rej1"), rejection));
    await assertSucceeds(setDoc(doc(dbFor(avery.uid), "rejections", "rej1"), rejection));
    await assertSucceeds(getDoc(doc(dbFor(alex.uid), "rejections", "rej1")));
  });
});
