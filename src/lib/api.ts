import { isDemo, useServer } from "../env";
import { getDemoDb } from "../demo/database";
import type { CsvRejection } from "./csv";
import { explain, isReason } from "./explain";
import type { ReasonCode, RejectionHit, UserProfile } from "../types";

export { explain, isReason };

type LiveApi = typeof import("./firebaseApi");

/**
 * Firestore or the server, chosen by VITE_BACKEND. The two export the same
 * calls with the same signatures; the cast is only here because firebaseApi
 * also exports its own query helper, and it goes away with that module.
 */
function live(): Promise<LiveApi> {
  return useServer ? (import("./httpApi") as unknown as Promise<LiveApi>) : import("./firebaseApi");
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

/**
 * Scouting platforms. These exist only on the portal server and in the demo,
 * so they do not go through live() and its firebaseApi shape.
 */
async function scoutApi() {
  if (!useServer) throw new Error("Scouts need the portal server.");
  return import("./httpApi");
}

export async function createScout(name: string, label: string): Promise<string> {
  if (isDemo) return getDemoDb().createScout(name, label);
  return (await scoutApi()).createScout(name, label);
}

export async function rotateScoutKey(id: string): Promise<string> {
  if (isDemo) return getDemoDb().rotateScoutKey(id);
  return (await scoutApi()).rotateScoutKey(id);
}

export async function updateScout(
  id: string,
  changes: { label?: string; active?: boolean },
): Promise<void> {
  if (isDemo) return getDemoDb().updateScout(id, changes);
  return (await scoutApi()).updateScout(id, changes);
}

export async function deleteScout(id: string): Promise<void> {
  if (isDemo) return getDemoDb().deleteScout(id);
  return (await scoutApi()).deleteScout(id);
}

/** Admin-written pages. The demo keeps a placeholder in the browser, never real text. */
export async function fetchPage(slug: string): Promise<string> {
  if (isDemo) return localStorage.getItem(`tjb-demo-page-${slug}`) ?? "## Sample heading\n- Sample point";
  return (await scoutApi()).fetchPage(slug);
}

export async function savePage(slug: string, body: string): Promise<void> {
  if (isDemo) return localStorage.setItem(`tjb-demo-page-${slug}`, body);
  return (await scoutApi()).savePage(slug, body);
}
