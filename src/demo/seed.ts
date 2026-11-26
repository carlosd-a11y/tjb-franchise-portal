import { normalizeAddress } from "../lib/normalize";

export type RawLocation = {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  normalizedAddress: string;
  lat: number | null;
  lng: number | null;
  sqft: number;
  rent: number;
  source: string;
  status: string;
  claimedBy: string | null;
  claimedByName: string | null;
  claimedAt: string | null;
  lastActivityAt: string;
  createdBy: string;
  createdAt: string;
  passReason: string | null;
};

export type RawNote = {
  id: string;
  text: string;
  authorUid: string;
  authorName: string;
  createdAt: string;
};

export type RawHistory = {
  id: string;
  fromStatus: string;
  toStatus: string;
  actorUid: string;
  actorName: string;
  reason: string | null;
  createdAt: string;
};

export type RawRejection = {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  normalizedAddress: string;
  rejectedBy: string;
  rejectedAt: string;
  reasonCode: string;
  reasonText: string;
};

export type RawInvite = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "franchisee";
  createdBy: string;
  createdAt: string;
  status: "pending" | "provisioned";
};

export type RawUser = {
  uid: string;
  email: string;
  name: string;
  role: "admin" | "franchisee";
  active: boolean;
};

export type RawDb = {
  users: RawUser[];
  invites: RawInvite[];
  locations: RawLocation[];
  notes: Record<string, RawNote[]>;
  history: Record<string, RawHistory[]>;
  rejections: RawRejection[];
};

function ago(days: number, hours = 0): string {
  return new Date(Date.now() - (days * 24 + hours) * 60 * 60 * 1000).toISOString();
}

function location(input: {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  sqft: number;
  rent: number;
  source: string;
  status: string;
  createdBy: string;
  at: string;
  claimedBy?: string | null;
  claimedByName?: string | null;
  claimedAt?: string | null;
  passReason?: string | null;
  lat?: number | null;
  lng?: number | null;
}): RawLocation {
  return {
    id: input.id,
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

/** Fictional sample rows. Dates are relative so claim windows stay meaningful. */
export function freshDemoDb(): RawDb {
  const harborAt = ago(0, 1);
  const researchAt = ago(2);
  const passedAt = ago(5);
  const tourAt = ago(12);
  const rejectedAt = ago(25);
  const staleAt = ago(40);
  const locations = [
    location({
      id: "loc-harbor",
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
    location({
      id: "loc-bay",
      address: "200 Sample Bay Rd",
      city: "Tampa",
      state: "FL",
      zip: "33602",
      sqft: 1100,
      rent: 5400,
      source: "manual",
      status: "pool",
      createdBy: "uid-alex",
      at: ago(0, 3),
    }),
    location({
      id: "loc-passed",
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
    location({
      id: "loc-research",
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
    location({
      id: "loc-submitted",
      address: "9 River Fake Blvd",
      city: "Jacksonville",
      state: "FL",
      zip: "32202",
      sqft: 1800,
      rent: 7200,
      source: "manual",
      status: "submitted",
      createdBy: "uid-alex",
      at: ago(6),
      claimedBy: "uid-alex",
      claimedByName: "Alex Rivera",
      claimedAt: ago(8),
    }),
    location({
      id: "loc-tour",
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
    location({
      id: "loc-approved",
      address: "80 Grove Example Ln",
      city: "Tampa",
      state: "FL",
      zip: "33606",
      sqft: 1500,
      rent: 5900,
      source: "manual",
      status: "approved",
      createdBy: "uid-alex",
      at: ago(20),
      claimedBy: "uid-alex",
      claimedByName: "Alex Rivera",
      claimedAt: ago(30),
    }),
    location({
      id: "loc-rejected",
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
    location({
      id: "loc-stale",
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
  ];

  return {
    users: [
      { uid: "uid-admin", email: "admin@tropicaljuice.test", name: "Avery Chen", role: "admin", active: true },
      { uid: "uid-alex", email: "alex@tropicaljuice.test", name: "Alex Rivera", role: "franchisee", active: true },
      { uid: "uid-jordan", email: "jordan@tropicaljuice.test", name: "Jordan Blake", role: "franchisee", active: true },
      { uid: "uid-sam", email: "sam@tropicaljuice.test", name: "Sam Lee", role: "franchisee", active: false },
    ],
    invites: [
      {
        id: "casey@tropicaljuice.test",
        email: "casey@tropicaljuice.test",
        name: "Casey Nguyen",
        role: "franchisee",
        createdBy: "uid-admin",
        createdAt: ago(1),
        status: "pending",
      },
    ],
    locations,
    notes: {
      "loc-harbor": [
        {
          id: "n1",
          text: "Bot added this. The ZIP was rejected once before.",
          authorUid: "uid-alex",
          authorName: "Alex Rivera",
          createdAt: harborAt,
        },
      ],
      "loc-research": [
        {
          id: "n1",
          text: "Broker says the landlord will discuss a shorter term.",
          authorUid: "uid-alex",
          authorName: "Alex Rivera",
          createdAt: ago(2, 2),
        },
        {
          id: "n2",
          text: "Walked the block. Weekday traffic looked light.",
          authorUid: "uid-jordan",
          authorName: "Jordan Blake",
          createdAt: ago(2, 1),
        },
      ],
    },
    history: {
      "loc-research": [
        { id: "h1", fromStatus: "pool", toStatus: "claimed", actorUid: "uid-alex", actorName: "Alex Rivera", reason: null, createdAt: ago(3) },
        { id: "h2", fromStatus: "claimed", toStatus: "researching", actorUid: "uid-alex", actorName: "Alex Rivera", reason: null, createdAt: researchAt },
      ],
      "loc-tour": [
        { id: "h1", fromStatus: "pool", toStatus: "claimed", actorUid: "uid-jordan", actorName: "Jordan Blake", reason: null, createdAt: ago(14) },
        { id: "h2", fromStatus: "claimed", toStatus: "researching", actorUid: "uid-jordan", actorName: "Jordan Blake", reason: null, createdAt: ago(13) },
        { id: "h3", fromStatus: "researching", toStatus: "touring", actorUid: "uid-jordan", actorName: "Jordan Blake", reason: null, createdAt: tourAt },
      ],
      "loc-passed": [
        {
          id: "h1",
          fromStatus: "claimed",
          toStatus: "pool",
          actorUid: "uid-jordan",
          actorName: "Jordan Blake",
          reason: "Rent jumped before the tour.",
          createdAt: passedAt,
        },
      ],
      "loc-stale": [
        { id: "h1", fromStatus: "pool", toStatus: "claimed", actorUid: "uid-jordan", actorName: "Jordan Blake", reason: null, createdAt: staleAt },
      ],
    },
    rejections: [
      {
        id: "rej-zip",
        address: "1 Warning Only Blvd",
        city: "Example Harbor",
        state: "FL",
        zip: "33139",
        normalizedAddress: normalizeAddress("1 Warning Only Blvd", "Example Harbor", "FL", "33139"),
        rejectedBy: "Historical Import",
        rejectedAt: "2024-09-09T00:00:00.000Z",
        reasonCode: "rent",
        reasonText: "FAKE seeded row. A prior site in this ZIP was too expensive.",
      },
      {
        id: "rej-closed",
        address: "500 Closed Sample Rd",
        city: "Miami",
        state: "FL",
        zip: "33140",
        normalizedAddress: normalizeAddress("500 Closed Sample Rd", "Miami", "FL", "33140"),
        rejectedBy: "Avery Chen",
        rejectedAt: rejectedAt,
        reasonCode: "rent",
        reasonText: "FAKE seeded row. Rent did not fit the sales forecast.",
      },
      {
        id: "rej-park",
        address: "55 Demo Lane",
        city: "Nowhere",
        state: "GA",
        zip: "00003",
        normalizedAddress: normalizeAddress("55 Demo Lane", "Nowhere", "GA", "00003"),
        rejectedBy: "Historical Import",
        rejectedAt: "2025-02-02T00:00:00.000Z",
        reasonCode: "parking",
        reasonText: "FAKE seeded row. No customer parking.",
      },
    ],
  };
}
