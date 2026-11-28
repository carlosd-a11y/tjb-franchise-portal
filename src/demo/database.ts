import { LIMITS, NEXT_STATUS, REJECTED_ADDRESS_LOCKED } from "../lib/model";
import { normalizeAddress } from "../lib/normalize";
import { matchRejectionHits } from "../lib/rejectionHits";
import { isClaimable, toDate } from "../lib/time";
import type { CsvRejection } from "../lib/csv";
import type {
  HistoryRecord,
  InviteRecord,
  LocationRecord,
  LocationStatus,
  NoteRecord,
  RejectionHit,
  RejectionRecord,
  ScoutRecord,
  UserProfile,
} from "../types";
import { freshDemoDb, type RawDb, type RawHistory, type RawLocation, type RawNote, type RawScout } from "./seed";

const DB_KEY = "tjb-demo-db-v1";
export const DEMO_ROLE_KEY = "tjb-demo-role";

export type DemoStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type Listener = () => void;

function stamp(iso: string | null): { toDate: () => Date } | null {
  if (!iso) return null;
  return { toDate: () => new Date(iso) };
}

function nowIso(): string {
  return new Date().toISOString();
}

function nid(): string {
  return Math.random().toString(36).slice(2, 12);
}

/** The demo has no server to issue a real key, so it shows a sample one. */
function demoKey(): string {
  return `demo-${Array.from({ length: 4 }, nid).join("")}`.slice(0, 44);
}

/** Same rule as server/serialize.py. The demo's role switch stores who is looking. */
function viewLocation(row: RawLocation, viewer: UserProfile | null): LocationRecord {
  const holds =
    !!viewer &&
    row.claimedBy === viewer.uid &&
    (row.status === "approved" ||
      (!["pool", "rejected"].includes(row.status) &&
        !isClaimable(row.status as LocationStatus, new Date(row.lastActivityAt))));
  const visible = viewer?.role === "admin" || holds;
  return {
    ...row,
    contactName: visible ? row.contactName : null,
    contactPhone: visible ? row.contactPhone : null,
    contactHidden: !visible && !!(row.contactName || row.contactPhone),
    status: row.status as LocationRecord["status"],
    claimedAt: stamp(row.claimedAt),
    lastActivityAt: stamp(row.lastActivityAt)!,
    createdAt: stamp(row.createdAt)!,
  } as LocationRecord;
}

export type DemoDatabase = {
  subscribe: (listener: Listener) => () => void;
  reset: () => void;
  locations: () => LocationRecord[];
  location: (id: string) => LocationRecord | null;
  notes: (id: string) => NoteRecord[];
  history: (id: string) => HistoryRecord[];
  rejections: () => RejectionRecord[];
  users: () => UserProfile[];
  invites: () => InviteRecord[];
  userById: (uid: string) => UserProfile | null;
  rejectionHits: (normalizedAddress: string, zip: string) => RejectionHit[];
  claim: (id: string, profile: UserProfile) => void;
  advance: (id: string, profile: UserProfile) => void;
  pass: (id: string, profile: UserProfile, reason: string) => void;
  keep: (id: string) => void;
  approve: (id: string, profile: UserProfile) => void;
  reject: (id: string, profile: UserProfile, reasonCode: RejectionRecord["reasonCode"], reasonText: string) => void;
  create: (profile: UserProfile, fields: Omit<RawLocation, "id" | "normalizedAddress" | "source" | "status" | "claimedBy" | "claimedByName" | "claimedAt" | "lastActivityAt" | "createdBy" | "createdAt" | "passReason"> & { normalizedAddress: string }) => string;
  updateAddress: (id: string, fields: Pick<RawLocation, "address" | "city" | "state" | "zip" | "normalizedAddress">) => void;
  addNote: (locationId: string, profile: UserProfile, text: string) => void;
  updateNote: (locationId: string, noteId: string, text: string) => void;
  deleteLocation: (id: string) => void;
  importRejections: (rows: CsvRejection[]) => void;
  saveUser: (profile: UserProfile) => void;
  saveInvite: (email: string, name: string, role: UserProfile["role"], createdBy: string) => void;
  updateInviteStatus: (id: string, status: "pending" | "provisioned") => void;
  scouts: () => ScoutRecord[];
  createScout: (name: string, label: string) => string;
  rotateScoutKey: (id: string) => string;
  updateScout: (id: string, changes: { label?: string; active?: boolean }) => void;
  deleteScout: (id: string) => void;
};

export function createDemoDatabase(storage: DemoStorage): DemoDatabase {
  const listeners = new Set<Listener>();
  let raw = load();

  function load(): RawDb {
    const saved = storage.getItem(DB_KEY);
    if (!saved) return freshDemoDb();
    try {
      const parsed = JSON.parse(saved) as RawDb;
      if (!parsed.locations || !parsed.users) return freshDemoDb();
      return parsed;
    } catch {
      return freshDemoDb();
    }
  }

  function viewer(): UserProfile | null {
    const uid = storage.getItem(DEMO_ROLE_KEY) === "admin" ? "uid-admin" : "uid-alex";
    return raw.users.find((user) => user.uid === uid) ?? null;
  }

  function persist() {
    storage.setItem(DB_KEY, JSON.stringify(raw));
    for (const listener of listeners) listener();
  }

  function loc(id: string): RawLocation {
    const row = raw.locations.find((item) => item.id === id);
    if (!row) throw new Error("Location not found.");
    return row;
  }

  function pushHistory(id: string, from: string, to: string, profile: UserProfile, reason: string | null) {
    const entry: RawHistory = {
      id: nid(),
      fromStatus: from,
      toStatus: to,
      actorUid: profile.uid,
      actorName: profile.name,
      reason,
      createdAt: nowIso(),
    };
    raw.history[id] = [...(raw.history[id] ?? []), entry];
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      raw = freshDemoDb();
      persist();
    },
    locations() {
      return raw.locations
        .map((row) => viewLocation(row, viewer()))
        .sort((a, b) => (toDate(b.lastActivityAt)?.getTime() ?? 0) - (toDate(a.lastActivityAt)?.getTime() ?? 0));
    },
    location(id) {
      const row = raw.locations.find((item) => item.id === id);
      return row ? viewLocation(row, viewer()) : null;
    },
    notes(id) {
      return (raw.notes[id] ?? []).map(
        (note) => ({ ...note, createdAt: stamp(note.createdAt)! }) as NoteRecord,
      );
    },
    history(id) {
      return (raw.history[id] ?? []).map(
        (item) => ({ ...item, createdAt: stamp(item.createdAt)! }) as HistoryRecord,
      );
    },
    rejections() {
      return raw.rejections
        .map((row) => ({ ...row, rejectedAt: stamp(row.rejectedAt)! }) as RejectionRecord)
        .sort((a, b) => (toDate(b.rejectedAt)?.getTime() ?? 0) - (toDate(a.rejectedAt)?.getTime() ?? 0));
    },
    users() {
      return [...raw.users].sort((a, b) => a.email.localeCompare(b.email));
    },
    invites() {
      return raw.invites
        .map((row) => ({ ...row, createdAt: stamp(row.createdAt)! }) as InviteRecord)
        .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0));
    },
    userById(uid) {
      return raw.users.find((user) => user.uid === uid) ?? null;
    },
    rejectionHits(normalizedAddress, zip) {
      return matchRejectionHits(this.rejections(), normalizedAddress, zip);
    },
    claim(id, profile) {
      const row = loc(id);
      const last = new Date(row.lastActivityAt);
      if (!isClaimable(row.status as LocationStatus, last)) throw new Error("Someone else already claimed this.");
      if (row.claimedBy === profile.uid) throw new Error("You already have this one.");
      const from = row.status;
      row.status = "claimed";
      row.claimedBy = profile.uid;
      row.claimedByName = profile.name;
      row.claimedAt = nowIso();
      row.lastActivityAt = nowIso();
      row.passReason = null;
      pushHistory(id, from, "claimed", profile, null);
      persist();
    },
    advance(id, profile) {
      const row = loc(id);
      const next = NEXT_STATUS[row.status as LocationStatus];
      if (!next) throw new Error("This location can't move forward.");
      const owner = row.claimedBy === profile.uid || profile.role === "admin";
      if (!owner) throw new Error("Only the owner can move this forward.");
      const from = row.status;
      row.status = next;
      row.lastActivityAt = nowIso();
      pushHistory(id, from, next, profile, null);
      persist();
    },
    pass(id, profile, reason) {
      const row = loc(id);
      if (!["claimed", "researching", "touring", "submitted"].includes(row.status)) {
        throw new Error("This location can't be passed.");
      }
      const from = row.status;
      row.status = "pool";
      row.claimedBy = null;
      row.claimedByName = null;
      row.claimedAt = null;
      row.lastActivityAt = nowIso();
      row.passReason = reason;
      pushHistory(id, from, "pool", profile, reason);
      persist();
    },
    keep(id) {
      loc(id).lastActivityAt = nowIso();
      persist();
    },
    approve(id, profile) {
      const row = loc(id);
      if (row.status !== "submitted") throw new Error("Only a submitted location can be approved.");
      const from = row.status;
      row.status = "approved";
      row.lastActivityAt = nowIso();
      pushHistory(id, from, "approved", profile, null);
      persist();
    },
    reject(id, profile, reasonCode, reasonText) {
      const row = loc(id);
      if (!["pool", "claimed", "researching", "touring", "submitted"].includes(row.status)) {
        throw new Error("This location is already closed.");
      }
      const from = row.status;
      row.status = "rejected";
      row.lastActivityAt = nowIso();
      raw.rejections.push({
        id: nid(),
        address: row.address,
        city: row.city,
        state: row.state,
        zip: row.zip,
        normalizedAddress: row.normalizedAddress,
        rejectedBy: profile.name,
        rejectedAt: nowIso(),
        reasonCode,
        reasonText,
      });
      pushHistory(id, from, "rejected", profile, reasonText);
      persist();
    },
    create(profile, fields) {
      if (raw.locations.some((row) => row.normalizedAddress === fields.normalizedAddress)) {
        throw new Error("That address is already in the list.");
      }
      const id = nid();
      const iso = nowIso();
      raw.locations.push({
        ...fields,
        id,
        source: "manual",
        status: "pool",
        claimedBy: null,
        claimedByName: null,
        claimedAt: null,
        lastActivityAt: iso,
        createdBy: profile.uid,
        createdAt: iso,
        passReason: null,
      });
      persist();
      return id;
    },
    updateAddress(id, fields) {
      const row = loc(id);
      if (row.status === "rejected") throw new Error(REJECTED_ADDRESS_LOCKED);
      if (raw.locations.some((item) => item.id !== id && item.normalizedAddress === fields.normalizedAddress)) {
        throw new Error("That address is already in the list.");
      }
      row.address = fields.address;
      row.city = fields.city;
      row.state = fields.state;
      row.zip = fields.zip;
      row.normalizedAddress = fields.normalizedAddress;
      persist();
    },
    addNote(locationId, profile, text) {
      const row = loc(locationId);
      const note: RawNote = {
        id: nid(),
        text,
        authorUid: profile.uid,
        authorName: profile.name,
        createdAt: nowIso(),
      };
      raw.notes[locationId] = [...(raw.notes[locationId] ?? []), note];
      if (["claimed", "researching", "touring", "submitted"].includes(row.status)) {
        if (row.claimedBy === profile.uid || profile.role === "admin") row.lastActivityAt = nowIso();
      }
      persist();
    },
    updateNote(locationId, noteId, text) {
      const note = (raw.notes[locationId] ?? []).find((item) => item.id === noteId);
      if (!note) throw new Error("Note not found.");
      note.text = text;
      persist();
    },
    deleteLocation(id) {
      raw.locations = raw.locations.filter((row) => row.id !== id);
      delete raw.notes[id];
      delete raw.history[id];
      persist();
    },
    importRejections(rows) {
      for (const row of rows) {
        raw.rejections.push({
          id: nid(),
          address: row.address.slice(0, LIMITS.address),
          city: row.city.slice(0, LIMITS.city),
          state: row.state,
          zip: row.zip,
          normalizedAddress: normalizeAddress(row.address, row.city, row.state, row.zip),
          rejectedBy: row.rejectedBy.slice(0, LIMITS.rejectedBy),
          rejectedAt: row.rejectedAt.toISOString(),
          reasonCode: row.reasonCode,
          reasonText: row.reasonText.slice(0, LIMITS.reason),
        });
      }
      persist();
    },
    saveUser(profile) {
      const index = raw.users.findIndex((user) => user.uid === profile.uid);
      if (index >= 0) raw.users[index] = profile;
      else raw.users.push(profile);
      persist();
    },
    saveInvite(email, name, role, createdBy) {
      const id = email.trim().toLowerCase();
      raw.invites = raw.invites.filter((invite) => invite.id !== id);
      raw.invites.push({
        id,
        email: id,
        name,
        role,
        createdBy,
        createdAt: nowIso(),
        status: "pending",
      });
      persist();
    },
    scouts() {
      return (raw.scouts ?? [])
        .map((row) => ({ ...row, createdAt: stamp(row.createdAt)!, lastSeenAt: stamp(row.lastSeenAt) }) as ScoutRecord)
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    createScout(name, label) {
      const slug = name.trim().toLowerCase();
      if (!/^[a-z0-9-]{1,24}$/.test(slug)) {
        throw new Error("Use lowercase letters, numbers and dashes for the short name.");
      }
      if (!label.trim()) throw new Error("Give the scout a name.");
      if (!raw.scouts) raw.scouts = [];
      if (raw.scouts.some((row) => row.name === slug)) {
        throw new Error("A scout with that short name already exists.");
      }
      const row: RawScout = {
        id: nid(),
        name: slug,
        label: label.trim(),
        active: true,
        createdBy: "uid-admin",
        createdAt: nowIso(),
        lastSeenAt: null,
        submitted: 0,
      };
      raw.scouts.push(row);
      persist();
      return demoKey();
    },
    rotateScoutKey(id) {
      if (!(raw.scouts ?? []).some((row) => row.id === id)) throw new Error("Scout not found.");
      persist();
      return demoKey();
    },
    updateScout(id, changes) {
      const row = (raw.scouts ?? []).find((item) => item.id === id);
      if (!row) throw new Error("Scout not found.");
      if (changes.label !== undefined) {
        if (!changes.label.trim()) throw new Error("Give the scout a name.");
        row.label = changes.label.trim();
      }
      if (changes.active !== undefined) row.active = changes.active;
      persist();
    },
    deleteScout(id) {
      raw.scouts = (raw.scouts ?? []).filter((row) => row.id !== id);
      persist();
    },
    updateInviteStatus(id, status) {
      const invite = raw.invites.find((item) => item.id === id);
      if (!invite) throw new Error("Invite not found.");
      invite.status = status;
      persist();
    },
  };
}

let singleton: DemoDatabase | null = null;

export function getDemoDb(): DemoDatabase {
  if (!singleton) {
    singleton = createDemoDatabase(localStorage);
  }
  return singleton;
}
