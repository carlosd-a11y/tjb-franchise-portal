import type { LocationStatus, ReasonCode } from "../types";

/** Keep in sync with firestore.rules (duration.value(30, 'd')) and api/src/Intake.php. */
export const CLAIM_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const LOCATION_LIST_LIMIT = 300;

/** Rejected rows keep their address so the rejection warning stays on it. */
export const REJECTED_ADDRESS_LOCKED = "A rejected location's address can't be changed.";

export const LIMITS = {
  address: 200,
  city: 80,
  name: 80,
  email: 120,
  note: 2000,
  reason: 500,
  rejectedBy: 120,
  normalized: 300,
  sqftMin: 1,
  sqftMax: 1_000_000,
  rentMin: 0,
  rentMax: 10_000_000,
} as const;

export const STATUSES: LocationStatus[] = [
  "pool",
  "claimed",
  "researching",
  "touring",
  "submitted",
  "approved",
  "rejected",
];

export const ACTIVE_CLAIM_STATUSES: LocationStatus[] = [
  "claimed",
  "researching",
  "touring",
  "submitted",
];

export const REASON_CODES: ReasonCode[] = [
  "rent",
  "traffic",
  "competition",
  "size",
  "zoning",
  "parking",
  "visibility",
  "landlord",
  "demographics",
  "other",
];

export const STATUS_LABEL: Record<LocationStatus, string> = {
  pool: "Pool",
  claimed: "Claimed",
  researching: "Researching",
  touring: "Touring",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

export const ADVANCE_LABEL: Partial<Record<LocationStatus, string>> = {
  claimed: "Start research",
  researching: "Mark touring",
  touring: "Submit",
};

export const NEXT_STATUS: Partial<Record<LocationStatus, LocationStatus>> = {
  claimed: "researching",
  researching: "touring",
  touring: "submitted",
};

export const REASON_LABEL: Record<ReasonCode, string> = {
  rent: "Rent",
  traffic: "Traffic",
  competition: "Competition",
  size: "Size",
  zoning: "Zoning",
  parking: "Parking",
  visibility: "Visibility",
  landlord: "Landlord",
  demographics: "Demographics",
  other: "Other",
};

export const CSV_COLUMNS = [
  "address",
  "city",
  "state",
  "zip",
  "rejectedBy",
  "rejectedAt",
  "reasonCode",
  "reasonText",
] as const;
