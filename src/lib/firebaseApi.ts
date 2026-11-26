import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebaseLive";
import { LIMITS, LOCATION_LIST_LIMIT, NEXT_STATUS } from "./model";
import { normalizeAddress } from "./normalize";
import { matchRejectionHits } from "./rejectionHits";
import { isClaimable, toDate } from "./time";
import type {
  LocationDoc,
  LocationStatus,
  ReasonCode,
  RejectionHit,
  RejectionRecord,
  UserProfile,
} from "../types";
import type { CsvRejection } from "./csv";

function historyRef(locationId: string) {
  return doc(collection(db, "locations", locationId, "history"));
}

function historyPayload(
  profile: UserProfile,
  fromStatus: LocationStatus,
  toStatus: LocationStatus,
  reason: string | null,
) {
  return {
    fromStatus,
    toStatus,
    actorUid: profile.uid,
    actorName: profile.name,
    reason,
    createdAt: serverTimestamp(),
  };
}

export async function claimLocation(id: string, profile: UserProfile): Promise<void> {
  const ref = doc(db, "locations", id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Location not found.");
    const data = snap.data() as LocationDoc;
    const last = toDate(data.lastActivityAt);
    if (!isClaimable(data.status, last)) throw new Error("Someone else already claimed this.");
    if (data.claimedBy === profile.uid) throw new Error("You already have this one.");
    tx.update(ref, {
      status: "claimed",
      claimedBy: profile.uid,
      claimedByName: profile.name,
      claimedAt: serverTimestamp(),
      lastActivityAt: serverTimestamp(),
      passReason: null,
    });
    tx.set(historyRef(id), historyPayload(profile, data.status, "claimed", null));
  });
}

export async function advanceLocation(id: string, profile: UserProfile): Promise<void> {
  const ref = doc(db, "locations", id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Location not found.");
    const data = snap.data() as LocationDoc;
    const next = NEXT_STATUS[data.status];
    if (!next) throw new Error("This location can't move forward.");
    const owner = data.claimedBy === profile.uid || profile.role === "admin";
    if (!owner) throw new Error("Only the owner can move this forward.");
    tx.update(ref, { status: next, lastActivityAt: serverTimestamp() });
    tx.set(historyRef(id), historyPayload(profile, data.status, next, null));
  });
}

export async function passLocation(id: string, profile: UserProfile, reason: string): Promise<void> {
  const ref = doc(db, "locations", id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Location not found.");
    const data = snap.data() as LocationDoc;
    if (!["claimed", "researching", "touring", "submitted"].includes(data.status)) {
      throw new Error("This location can't be passed.");
    }
    tx.update(ref, {
      status: "pool",
      claimedBy: null,
      claimedByName: null,
      claimedAt: null,
      lastActivityAt: serverTimestamp(),
      passReason: reason,
    });
    tx.set(historyRef(id), historyPayload(profile, data.status, "pool", reason));
  });
}

export async function keepLocation(id: string): Promise<void> {
  await updateDoc(doc(db, "locations", id), { lastActivityAt: serverTimestamp() });
}

export async function approveLocation(id: string, profile: UserProfile): Promise<void> {
  const ref = doc(db, "locations", id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Location not found.");
    const data = snap.data() as LocationDoc;
    if (data.status !== "submitted") throw new Error("Only a submitted location can be approved.");
    tx.update(ref, { status: "approved", lastActivityAt: serverTimestamp() });
    tx.set(historyRef(id), historyPayload(profile, data.status, "approved", null));
  });
}

export async function rejectLocation(
  id: string,
  profile: UserProfile,
  reasonCode: ReasonCode,
  reasonText: string,
): Promise<void> {
  const ref = doc(db, "locations", id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Location not found.");
    const data = snap.data() as LocationDoc;
    if (!["pool", "claimed", "researching", "touring", "submitted"].includes(data.status)) {
      throw new Error("This location is already closed.");
    }
    tx.update(ref, { status: "rejected", lastActivityAt: serverTimestamp() });
    tx.set(doc(collection(db, "rejections")), {
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      normalizedAddress: data.normalizedAddress,
      rejectedBy: profile.name,
      rejectedAt: serverTimestamp(),
      reasonCode,
      reasonText,
    });
    tx.set(historyRef(id), historyPayload(profile, data.status, "rejected", reasonText));
  });
}

export async function createLocation(
  profile: UserProfile,
  fields: Omit<
    LocationDoc,
    | "source"
    | "status"
    | "claimedBy"
    | "claimedByName"
    | "claimedAt"
    | "lastActivityAt"
    | "createdBy"
    | "createdAt"
    | "passReason"
  >,
): Promise<string> {
  const existing = await getDocs(
    query(
      collection(db, "locations"),
      where("normalizedAddress", "==", fields.normalizedAddress),
      limit(1),
    ),
  );
  if (!existing.empty) throw new Error("That address is already in the list.");
  const ref = await addDoc(collection(db, "locations"), {
    ...fields,
    source: "manual",
    status: "pool",
    claimedBy: null,
    claimedByName: null,
    claimedAt: null,
    lastActivityAt: serverTimestamp(),
    createdBy: profile.uid,
    createdAt: serverTimestamp(),
    passReason: null,
  });
  return ref.id;
}

export async function addNote(locationId: string, profile: UserProfile, text: string): Promise<void> {
  const ref = doc(db, "locations", locationId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Location not found.");
    const data = snap.data() as LocationDoc;
    tx.set(doc(collection(db, "locations", locationId, "notes")), {
      text,
      authorUid: profile.uid,
      authorName: profile.name,
      createdAt: serverTimestamp(),
    });
    const active = ["claimed", "researching", "touring", "submitted"].includes(data.status);
    if (active && (data.claimedBy === profile.uid || profile.role === "admin")) {
      tx.update(ref, { lastActivityAt: serverTimestamp() });
    }
  });
}

export async function updateNote(locationId: string, noteId: string, text: string): Promise<void> {
  await updateDoc(doc(db, "locations", locationId, "notes", noteId), { text });
}

export async function deleteLocation(id: string): Promise<void> {
  const notes = await getDocs(collection(db, "locations", id, "notes"));
  const history = await getDocs(collection(db, "locations", id, "history"));
  const refs = [...notes.docs.map((item) => item.ref), ...history.docs.map((item) => item.ref)];
  while (refs.length > 0) {
    const batch = writeBatch(db);
    refs.splice(0, 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, "locations", id));
}

export async function findRejectionHits(normalizedAddress: string, zip: string): Promise<RejectionHit[]> {
  const [byAddress, byZip] = await Promise.all([
    getDocs(
      query(
        collection(db, "rejections"),
        where("normalizedAddress", "==", normalizedAddress),
        limit(10),
      ),
    ),
    getDocs(query(collection(db, "rejections"), where("zip", "==", zip), limit(10))),
  ]);
  const rows = new Map<string, RejectionRecord>();
  for (const snap of [...byAddress.docs, ...byZip.docs]) {
    rows.set(snap.id, { id: snap.id, ...snap.data() } as RejectionRecord);
  }
  return matchRejectionHits([...rows.values()], normalizedAddress, zip);
}

export function locationsQuery() {
  return query(
    collection(db, "locations"),
    orderBy("lastActivityAt", "desc"),
    limit(LOCATION_LIST_LIMIT),
  );
}

export async function importRejections(rows: CsvRejection[]): Promise<void> {
  for (let index = 0; index < rows.length; index += 400) {
    const batch = writeBatch(db);
    rows.slice(index, index + 400).forEach((row) => {
      batch.set(doc(collection(db, "rejections")), {
        address: row.address.slice(0, LIMITS.address),
        city: row.city.slice(0, LIMITS.city),
        state: row.state,
        zip: row.zip,
        normalizedAddress: normalizeAddress(row.address, row.city, row.state, row.zip),
        rejectedBy: row.rejectedBy.slice(0, LIMITS.rejectedBy),
        rejectedAt: Timestamp.fromDate(row.rejectedAt),
        reasonCode: row.reasonCode,
        reasonText: row.reasonText.slice(0, LIMITS.reason),
      });
    });
    await batch.commit();
  }
}

export async function updateInviteStatus(id: string, status: "pending" | "provisioned"): Promise<void> {
  await updateDoc(doc(db, "invites", id), { status });
}

export async function saveUser(profile: UserProfile): Promise<void> {
  await setDoc(doc(db, "users", profile.uid), profile);
}

export async function saveInvite(
  email: string,
  name: string,
  role: UserProfile["role"],
  createdBy: string,
): Promise<void> {
  const id = email.trim().toLowerCase();
  await setDoc(doc(db, "invites", id), {
    email: id,
    name,
    role,
    createdBy,
    createdAt: serverTimestamp(),
    status: "pending",
  });
}
