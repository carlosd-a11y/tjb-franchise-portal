import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { normalizeAddress } from "../src/lib/normalize";

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "demo-tropical-juice";

if (!firestoreHost || !authHost) {
  console.error("Refusing to seed: emulator hosts are not set. This script never touches a real Firebase project.");
  process.exit(1);
}
if (!projectId.startsWith("demo-")) {
  console.error(`Refusing to seed project "${projectId}". Use a demo- project id.`);
  process.exit(1);
}

initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();

const PASSWORD = "DemoPassw0rd!";

const users = [
  { uid: "uid-admin", email: "admin@tropicaljuice.test", name: "Avery Chen", role: "admin", active: true },
  { uid: "uid-alex", email: "alex@tropicaljuice.test", name: "Alex Rivera", role: "franchisee", active: true },
  { uid: "uid-jordan", email: "jordan@tropicaljuice.test", name: "Jordan Blake", role: "franchisee", active: true },
  { uid: "uid-sam", email: "sam@tropicaljuice.test", name: "Sam Lee", role: "franchisee", active: false },
] as const;

function ago(days: number, hours = 0): Timestamp {
  return Timestamp.fromDate(new Date(Date.now() - (days * 24 + hours) * 60 * 60 * 1000));
}

function location(input: {
  address: string;
  city: string;
  state: string;
  zip: string;
  sqft: number;
  rent: number;
  source: string;
  status: string;
  createdBy: string;
  at: Timestamp;
  claimedBy?: string | null;
  claimedByName?: string | null;
  claimedAt?: Timestamp | null;
  passReason?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  return {
    address: input.address,
    city: input.city,
    state: input.state,
    zip: input.zip,
    normalizedAddress: normalizeAddress(input.address, input.city, input.state, input.zip),
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    sqft: input.sqft,
    rent: input.rent,
    source: input.source,
    status: input.status,
    claimedBy: input.claimedBy ?? null,
    claimedByName: input.claimedByName ?? null,
    claimedAt: input.claimedAt ?? null,
    lastActivityAt: input.at,
    createdBy: input.createdBy,
    createdAt: ago(60),
    passReason: input.passReason ?? null,
  };
}

async function clearCollection(name: string) {
  const snap = await db.collection(name).get();
  for (const item of snap.docs) {
    const subs = await item.ref.listCollections();
    for (const sub of subs) {
      const children = await sub.get();
      for (const child of children.docs) await child.ref.delete();
    }
    await item.ref.delete();
  }
}

async function addHistory(
  firestore: Firestore,
  locationId: string,
  rows: Array<{ id: string; from: string; to: string; uid: string; name: string; at: Timestamp; reason?: string | null }>,
) {
  for (const row of rows) {
    await firestore.collection("locations").doc(locationId).collection("history").doc(row.id).set({
      fromStatus: row.from,
      toStatus: row.to,
      actorUid: row.uid,
      actorName: row.name,
      reason: row.reason ?? null,
      createdAt: row.at,
    });
  }
}

async function main() {
  const existing = await auth.listUsers(1000);
  for (const user of existing.users) await auth.deleteUser(user.uid);
  for (const name of ["users", "locations", "rejections", "invites"]) await clearCollection(name);

  for (const user of users) {
    await auth.createUser({
      uid: user.uid,
      email: user.email,
      password: PASSWORD,
      displayName: user.name,
      emailVerified: true,
    });
    await db.collection("users").doc(user.uid).set({ ...user });
  }

  const harborAt = ago(0, 1);
  const bayAt = ago(0, 3);
  const researchAt = ago(2);
  const submittedAt = ago(6);
  const passedAt = ago(5);
  const tourAt = ago(12);
  const approvedAt = ago(20);
  const rejectedAt = ago(25);
  const staleAt = ago(40);

  const rows: Record<string, ReturnType<typeof location>> = {
    "loc-harbor": location({
      address: "100 Demo Harbor Dr",
      city: "Miami",
      state: "FL",
      zip: "33139",
      sqft: 1450,
      rent: 8200,
      source: "bot:muse",
      status: "pool",
      createdBy: "bot:muse",
      at: harborAt,
      lat: 25.7617,
      lng: -80.1918,
    }),
    "loc-bay": location({
      address: "200 Sample Bay Rd",
      city: "Tampa",
      state: "FL",
      zip: "33602",
      sqft: 1100,
      rent: 5400,
      source: "manual",
      status: "pool",
      createdBy: "uid-alex",
      at: bayAt,
    }),
    "loc-passed": location({
      address: "12 Returned Demo St",
      city: "Orlando",
      state: "FL",
      zip: "32803",
      sqft: 1250,
      rent: 5100,
      source: "manual",
      status: "pool",
      createdBy: "uid-jordan",
      at: passedAt,
      passReason: "Rent jumped before the tour.",
    }),
    "loc-research": location({
      address: "18 Palm Sample St",
      city: "Orlando",
      state: "FL",
      zip: "32801",
      sqft: 1600,
      rent: 6100,
      source: "manual",
      status: "researching",
      createdBy: "uid-alex",
      at: researchAt,
      claimedBy: "uid-alex",
      claimedByName: "Alex Rivera",
      claimedAt: ago(3),
    }),
    "loc-submitted": location({
      address: "9 River Fake Blvd",
      city: "Jacksonville",
      state: "FL",
      zip: "32202",
      sqft: 1800,
      rent: 7200,
      source: "manual",
      status: "submitted",
      createdBy: "uid-alex",
      at: submittedAt,
      claimedBy: "uid-alex",
      claimedByName: "Alex Rivera",
      claimedAt: ago(8),
    }),
    "loc-tour": location({
      address: "44 Orange Demo Ave",
      city: "Orlando",
      state: "FL",
      zip: "32801",
      sqft: 1300,
      rent: 4800,
      source: "bot:scout",
      status: "touring",
      createdBy: "bot:scout",
      at: tourAt,
      claimedBy: "uid-jordan",
      claimedByName: "Jordan Blake",
      claimedAt: ago(14),
    }),
    "loc-approved": location({
      address: "80 Grove Example Ln",
      city: "Tampa",
      state: "FL",
      zip: "33606",
      sqft: 1500,
      rent: 5900,
      source: "manual",
      status: "approved",
      createdBy: "uid-alex",
      at: approvedAt,
      claimedBy: "uid-alex",
      claimedByName: "Alex Rivera",
      claimedAt: ago(30),
    }),
    "loc-rejected": location({
      address: "500 Closed Sample Rd",
      city: "Miami",
      state: "FL",
      zip: "33140",
      sqft: 980,
      rent: 7600,
      source: "manual",
      status: "rejected",
      createdBy: "uid-jordan",
      at: rejectedAt,
      claimedBy: "uid-jordan",
      claimedByName: "Jordan Blake",
      claimedAt: ago(28),
    }),
    "loc-stale": location({
      address: "3 Quiet Test Ct",
      city: "Fort Lauderdale",
      state: "FL",
      zip: "33301",
      sqft: 900,
      rent: 3900,
      source: "manual",
      status: "claimed",
      createdBy: "uid-jordan",
      at: staleAt,
      claimedBy: "uid-jordan",
      claimedByName: "Jordan Blake",
      claimedAt: staleAt,
    }),
  };

  for (const [id, data] of Object.entries(rows)) {
    await db.collection("locations").doc(id).set(data);
  }

  await db.collection("locations").doc("loc-harbor").collection("notes").doc("n1").set({
    text: "Bot added this. The ZIP was rejected once before.",
    authorUid: "uid-alex",
    authorName: "Alex Rivera",
    createdAt: harborAt,
  });
  await db.collection("locations").doc("loc-research").collection("notes").doc("n1").set({
    text: "Broker says the landlord will discuss a shorter term.",
    authorUid: "uid-alex",
    authorName: "Alex Rivera",
    createdAt: ago(2, 2),
  });
  await db.collection("locations").doc("loc-research").collection("notes").doc("n2").set({
    text: "Walked the block. Weekday traffic looked light.",
    authorUid: "uid-jordan",
    authorName: "Jordan Blake",
    createdAt: ago(2, 1),
  });

  await addHistory(db, "loc-research", [
    { id: "h1", from: "pool", to: "claimed", uid: "uid-alex", name: "Alex Rivera", at: ago(3) },
    { id: "h2", from: "claimed", to: "researching", uid: "uid-alex", name: "Alex Rivera", at: researchAt },
  ]);
  await addHistory(db, "loc-tour", [
    { id: "h1", from: "pool", to: "claimed", uid: "uid-jordan", name: "Jordan Blake", at: ago(14) },
    { id: "h2", from: "claimed", to: "researching", uid: "uid-jordan", name: "Jordan Blake", at: ago(13) },
    { id: "h3", from: "researching", to: "touring", uid: "uid-jordan", name: "Jordan Blake", at: tourAt },
  ]);
  await addHistory(db, "loc-passed", [
    { id: "h1", from: "claimed", to: "pool", uid: "uid-jordan", name: "Jordan Blake", at: passedAt, reason: "Rent jumped before the tour." },
  ]);
  await addHistory(db, "loc-stale", [
    { id: "h1", from: "pool", to: "claimed", uid: "uid-jordan", name: "Jordan Blake", at: staleAt },
  ]);

  await db.collection("rejections").doc("rej-zip").set({
    address: "1 Warning Only Blvd",
    city: "Example Harbor",
    state: "FL",
    zip: "33139",
    normalizedAddress: normalizeAddress("1 Warning Only Blvd", "Example Harbor", "FL", "33139"),
    rejectedBy: "Historical Import",
    rejectedAt: Timestamp.fromDate(new Date("2024-09-09T00:00:00Z")),
    reasonCode: "rent",
    reasonText: "FAKE seeded row. A prior site in this ZIP was too expensive.",
  });
  await db.collection("rejections").doc("rej-closed").set({
    address: "500 Closed Sample Rd",
    city: "Miami",
    state: "FL",
    zip: "33140",
    normalizedAddress: normalizeAddress("500 Closed Sample Rd", "Miami", "FL", "33140"),
    rejectedBy: "Avery Chen",
    rejectedAt: rejectedAt,
    reasonCode: "rent",
    reasonText: "FAKE seeded row. Rent did not fit the sales forecast.",
  });
  await db.collection("rejections").doc("rej-park").set({
    address: "55 Demo Lane",
    city: "Nowhere",
    state: "GA",
    zip: "00003",
    normalizedAddress: normalizeAddress("55 Demo Lane", "Nowhere", "GA", "00003"),
    rejectedBy: "Historical Import",
    rejectedAt: Timestamp.fromDate(new Date("2025-02-02T00:00:00Z")),
    reasonCode: "parking",
    reasonText: "FAKE seeded row. No customer parking.",
  });

  await db.collection("invites").doc("casey@tropicaljuice.test").set({
    email: "casey@tropicaljuice.test",
    name: "Casey Nguyen",
    role: "franchisee",
    createdBy: "uid-admin",
    createdAt: ago(1),
    status: "pending",
  });

  console.log("Seeded the local emulators with fictional data.");
  console.log("Franchisee  alex@tropicaljuice.test");
  console.log("Admin        admin@tropicaljuice.test");
  console.log("Password     DemoPassw0rd!  (emulator only)");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
