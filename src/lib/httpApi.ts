import { auth } from "../firebaseLive";
import type { CsvRejection } from "./csv";
import type {
  HistoryRecord,
  InviteRecord,
  LocationDoc,
  LocationRecord,
  NoteRecord,
  ReasonCode,
  RejectionHit,
  RejectionRecord,
  ScoutRecord,
  UserProfile,
} from "../types";

/**
 * The server on the VPS. Firebase still signs people in; this sends the token
 * it issues and the server decides what the person may do.
 * See docs/adr-001-backend-on-the-vps.md.
 */

type Stamp = { toDate: () => Date };

/** The pages call .toDate(), as they did with Firestore and with the demo store. */
function stamp(iso: string | null): Stamp | null {
  return iso ? { toDate: () => new Date(iso) } : null;
}

function withStamps<T>(row: Record<string, unknown>, keys: string[]): T {
  const copy: Record<string, unknown> = { ...row };
  for (const key of keys) copy[key] = stamp(row[key] as string | null);
  return copy as T;
}

const location = (row: Record<string, unknown>) =>
  withStamps<LocationRecord>(row, ["claimedAt", "lastActivityAt", "createdAt"]);
const note = (row: Record<string, unknown>) => withStamps<NoteRecord>(row, ["createdAt"]);
const history = (row: Record<string, unknown>) => withStamps<HistoryRecord>(row, ["createdAt"]);
const rejection = (row: Record<string, unknown>) => withStamps<RejectionRecord>(row, ["rejectedAt"]);
const invite = (row: Record<string, unknown>) => withStamps<InviteRecord>(row, ["createdAt"]);

async function token(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in again.");
  return user.getIdToken();
}

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${await token()}`,
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || "Something went wrong.");
  return body as T;
}

const post = <T>(path: string, body?: unknown) =>
  send<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

const patch = <T>(path: string, body: unknown) =>
  send<T>(path, { method: "PATCH", body: JSON.stringify(body) });

/**
 * Two screens read the same location at the same moment, once for the row and
 * again for its notes and history. One request serves all three.
 */
const inFlight = new Map<string, Promise<unknown>>();

function shared<T>(key: string, run: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const promise = run().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export type LocationPage = {
  location: LocationRecord;
  notes: NoteRecord[];
  history: HistoryRecord[];
};

export function fetchLocations(): Promise<LocationRecord[]> {
  return shared("locations", () =>
    send<{ locations: Record<string, unknown>[] }>("/api/locations").then((body) =>
      body.locations.map(location),
    ),
  );
}

export function fetchLocationPage(id: string): Promise<LocationPage | null> {
  return shared(`location:${id}`, async () => {
    try {
      const body = await send<{
        location: Record<string, unknown>;
        notes: Record<string, unknown>[];
        history: Record<string, unknown>[];
      }>(`/api/locations/${id}`);
      return {
        location: location(body.location),
        notes: body.notes.map(note),
        history: body.history.map(history),
      };
    } catch (error) {
      if (error instanceof Error && error.message === "Location not found.") return null;
      throw error;
    }
  });
}

export function fetchRejections(): Promise<RejectionRecord[]> {
  return shared("rejections", () =>
    send<{ rejections: Record<string, unknown>[] }>("/api/rejections").then((body) =>
      body.rejections.map(rejection),
    ),
  );
}

export function fetchUsers(): Promise<UserProfile[]> {
  return shared("users", () => send<{ users: UserProfile[] }>("/api/users").then((body) => body.users));
}

export function fetchInvites(): Promise<InviteRecord[]> {
  return shared("invites", () =>
    send<{ invites: Record<string, unknown>[] }>("/api/invites").then((body) => body.invites.map(invite)),
  );
}

const scout = (row: Record<string, unknown>) =>
  withStamps<ScoutRecord>(row, ["createdAt", "lastSeenAt"]);

export function fetchScouts(): Promise<ScoutRecord[]> {
  return shared("scouts", () =>
    send<{ scouts: Record<string, unknown>[] }>("/api/scouts").then((body) => body.scouts.map(scout)),
  );
}

/** The key comes back once, here, and is never retrievable again. */
export function createScout(name: string, label: string): Promise<string> {
  return post<{ key: string }>("/api/scouts", { name, label }).then((body) => body.key);
}

export function rotateScoutKey(id: string): Promise<string> {
  return post<{ key: string }>(`/api/scouts/${id}/rotate`).then((body) => body.key);
}

export async function updateScout(id: string, changes: { label?: string; active?: boolean }): Promise<void> {
  await patch(`/api/scouts/${id}`, changes);
}

export async function deleteScout(id: string): Promise<void> {
  await send(`/api/scouts/${id}`, { method: "DELETE" });
}

export function fetchProfile(): Promise<UserProfile> {
  return send<UserProfile>("/api/me");
}

// ── The same calls api.ts already makes ───────────────────────────────────────

export async function claimLocation(id: string, _profile: UserProfile): Promise<void> {
  await post(`/api/locations/${id}/claim`);
}

export async function advanceLocation(id: string, _profile: UserProfile): Promise<void> {
  await post(`/api/locations/${id}/advance`);
}

export async function passLocation(id: string, _profile: UserProfile, reason: string): Promise<void> {
  await post(`/api/locations/${id}/pass`, { reason });
}

export async function keepLocation(id: string): Promise<void> {
  await post(`/api/locations/${id}/keep`);
}

export async function approveLocation(id: string, _profile: UserProfile): Promise<void> {
  await post(`/api/locations/${id}/approve`);
}

export async function rejectLocation(
  id: string,
  _profile: UserProfile,
  reasonCode: ReasonCode,
  reasonText: string,
): Promise<void> {
  await post(`/api/locations/${id}/reject`, { reasonCode, reasonText });
}

export type AddressFields = Pick<LocationDoc, "address" | "city" | "state" | "zip" | "normalizedAddress">;

export async function createLocation(
  _profile: UserProfile,
  fields: Omit<
    LocationDoc,
    | "source" | "status" | "claimedBy" | "claimedByName" | "claimedAt"
    | "lastActivityAt" | "createdBy" | "createdAt" | "passReason"
  >,
): Promise<string> {
  const body = await post<{ id: string }>("/api/locations", fields);
  return body.id;
}

export async function updateLocationAddress(id: string, fields: AddressFields): Promise<void> {
  await patch(`/api/locations/${id}/address`, fields);
}

export async function addNote(locationId: string, _profile: UserProfile, text: string): Promise<void> {
  await post(`/api/locations/${locationId}/notes`, { text });
}

export async function updateNote(locationId: string, noteId: string, text: string): Promise<void> {
  await patch(`/api/locations/${locationId}/notes/${noteId}`, { text });
}

export async function deleteLocation(id: string): Promise<void> {
  await send(`/api/locations/${id}`, { method: "DELETE" });
}

export async function findRejectionHits(normalizedAddress: string, zip: string): Promise<RejectionHit[]> {
  const query = new URLSearchParams({ normalizedAddress, zip });
  const body = await send<{ hits: RejectionHit[] }>(`/api/rejection-hits?${query}`);
  return body.hits;
}

export async function importRejections(rows: CsvRejection[]): Promise<void> {
  await post("/api/rejections/import", {
    rows: rows.map((row) => ({ ...row, rejectedAt: row.rejectedAt.toISOString() })),
  });
}

export async function saveUser(profile: UserProfile): Promise<void> {
  await send(`/api/users/${profile.uid}`, { method: "PUT", body: JSON.stringify(profile) });
}

export async function saveInvite(
  email: string,
  name: string,
  role: UserProfile["role"],
  _createdBy: string,
): Promise<void> {
  await post("/api/invites", { email, name, role });
}

export async function updateInviteStatus(id: string, status: "pending" | "provisioned"): Promise<void> {
  await patch(`/api/invites/${encodeURIComponent(id)}`, { status });
}

export function fetchPage(slug: string): Promise<string> {
  return send<{ body: string }>(`/api/pages/${slug}`).then((page) => page.body);
}

export async function savePage(slug: string, body: string): Promise<void> {
  await send(`/api/pages/${slug}`, { method: "PUT", body: JSON.stringify({ body }) });
}
