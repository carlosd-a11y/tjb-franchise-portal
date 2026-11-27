import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "franchisee";

export type LocationStatus =
  | "pool"
  | "claimed"
  | "researching"
  | "touring"
  | "submitted"
  | "approved"
  | "rejected";

export type ReasonCode =
  | "rent"
  | "traffic"
  | "competition"
  | "size"
  | "zoning"
  | "parking"
  | "visibility"
  | "landlord"
  | "demographics"
  | "other";

export type UserProfile = {
  uid: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
};

export type LocationDoc = {
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
  status: LocationStatus;
  claimedBy: string | null;
  claimedByName: string | null;
  claimedAt: Timestamp | null;
  lastActivityAt: Timestamp;
  createdBy: string;
  createdAt: Timestamp;
  passReason: string | null;
};

export type LocationRecord = LocationDoc & { id: string };

export type NoteDoc = {
  text: string;
  authorUid: string;
  authorName: string;
  createdAt: Timestamp;
};

export type NoteRecord = NoteDoc & { id: string };

export type HistoryDoc = {
  fromStatus: LocationStatus;
  toStatus: LocationStatus;
  actorUid: string;
  actorName: string;
  reason: string | null;
  createdAt: Timestamp;
};

export type HistoryRecord = HistoryDoc & { id: string };

export type RejectionDoc = {
  address: string;
  city: string;
  state: string;
  zip: string;
  normalizedAddress: string;
  rejectedBy: string;
  rejectedAt: Timestamp;
  reasonCode: ReasonCode;
  reasonText: string;
};

export type RejectionRecord = RejectionDoc & { id: string };

export type InviteDoc = {
  email: string;
  name: string;
  role: Role;
  createdBy: string;
  createdAt: Timestamp;
  status: "pending" | "provisioned";
};

export type InviteRecord = InviteDoc & { id: string };

/** A scouting platform allowed to push finds in. The key is never held here. */
export type ScoutRecord = {
  id: string;
  name: string;
  label: string;
  active: boolean;
  createdBy: string;
  createdAt: Timestamp;
  lastSeenAt: Timestamp | null;
  submitted: number;
};

export type RejectionHit = {
  id: string;
  reasonCode: ReasonCode;
  reasonText: string;
  match: "address" | "zip";
  city: string;
  state: string;
  zip: string;
};
