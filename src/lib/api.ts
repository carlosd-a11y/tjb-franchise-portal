import { isDemo } from "../env";
import { getDemoDb } from "../demo/database";
import type { CsvRejection } from "./csv";
import { explain, isReason } from "./explain";
import type { ReasonCode, RejectionHit, UserProfile } from "../types";

export { explain, isReason };

type LiveApi = typeof import("./firebaseApi");

function live(): Promise<LiveApi> {
  return import("./firebaseApi");
}

export async function claimLocation(id: string, profile: UserProfile): Promise<void> {
  if (isDemo) return getDemoDb().claim(id, profile);
  return (await live()).claimLocation(id, profile);
}

export async function advanceLocation(id: string, profile: UserProfile): Promise<void> {
  if (isDemo) return getDemoDb().advance(id, profile);
  return (await live()).advanceLocation(id, profile);
}

export async function passLocation(id: string, profile: UserProfile, reason: string): Promise<void> {
  if (isDemo) return getDemoDb().pass(id, profile, reason);
  return (await live()).passLocation(id, profile, reason);
}

export async function keepLocation(id: string): Promise<void> {
  if (isDemo) return getDemoDb().keep(id);
  return (await live()).keepLocation(id);
}

export async function approveLocation(id: string, profile: UserProfile): Promise<void> {
  if (isDemo) return getDemoDb().approve(id, profile);
  return (await live()).approveLocation(id, profile);
}

export async function rejectLocation(
  id: string,
  profile: UserProfile,
  reasonCode: ReasonCode,
  reasonText: string,
): Promise<void> {
  if (isDemo) return getDemoDb().reject(id, profile, reasonCode, reasonText);
  return (await live()).rejectLocation(id, profile, reasonCode, reasonText);
}

export async function createLocation(
  profile: UserProfile,
  fields: Parameters<LiveApi["createLocation"]>[1],
): Promise<string> {
  if (isDemo) return getDemoDb().create(profile, fields);
  return (await live()).createLocation(profile, fields);
}

export async function updateLocationAddress(
  id: string,
  fields: Parameters<LiveApi["updateLocationAddress"]>[1],
): Promise<void> {
  if (isDemo) return getDemoDb().updateAddress(id, fields);
  return (await live()).updateLocationAddress(id, fields);
}

export async function addNote(locationId: string, profile: UserProfile, text: string): Promise<void> {
  if (isDemo) return getDemoDb().addNote(locationId, profile, text);
  return (await live()).addNote(locationId, profile, text);
}

export async function updateNote(locationId: string, noteId: string, text: string): Promise<void> {
  if (isDemo) return getDemoDb().updateNote(locationId, noteId, text);
  return (await live()).updateNote(locationId, noteId, text);
}

export async function deleteLocation(id: string): Promise<void> {
  if (isDemo) return getDemoDb().deleteLocation(id);
  return (await live()).deleteLocation(id);
}

export async function findRejectionHits(normalizedAddress: string, zip: string): Promise<RejectionHit[]> {
  if (isDemo) return getDemoDb().rejectionHits(normalizedAddress, zip);
  return (await live()).findRejectionHits(normalizedAddress, zip);
}

export async function importRejections(rows: CsvRejection[]): Promise<void> {
  if (isDemo) return getDemoDb().importRejections(rows);
  return (await live()).importRejections(rows);
}

export async function updateInviteStatus(id: string, status: "pending" | "provisioned"): Promise<void> {
  if (isDemo) return getDemoDb().updateInviteStatus(id, status);
  return (await live()).updateInviteStatus(id, status);
}

export async function saveUser(profile: UserProfile): Promise<void> {
  if (isDemo) return getDemoDb().saveUser(profile);
  return (await live()).saveUser(profile);
}

export async function saveInvite(
  email: string,
  name: string,
  role: UserProfile["role"],
  createdBy: string,
): Promise<void> {
  if (isDemo) return getDemoDb().saveInvite(email, name, role, createdBy);
  return (await live()).saveInvite(email, name, role, createdBy);
}
