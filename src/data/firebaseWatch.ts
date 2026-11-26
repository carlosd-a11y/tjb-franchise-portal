import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebaseLive";
import { locationsQuery } from "../lib/firebaseApi";
import type { HistoryRecord, InviteRecord, LocationRecord, NoteRecord, RejectionRecord, UserProfile } from "../types";

export function watchLocationsLive(
  onData: (rows: LocationRecord[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    locationsQuery(),
    (snap) => onData(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as LocationRecord)),
    (error) => onError(error),
  );
}

export function watchLocationLive(
  id: string,
  onData: (row: LocationRecord | null) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, "locations", id),
    (snap) => onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as LocationRecord) : null),
    (error) => onError(error),
  );
}

export function watchNotesLive(id: string, onData: (rows: NoteRecord[]) => void): () => void {
  return onSnapshot(query(collection(db, "locations", id, "notes"), orderBy("createdAt", "asc")), (snap) =>
    onData(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as NoteRecord)),
  );
}

export function watchHistoryLive(id: string, onData: (rows: HistoryRecord[]) => void): () => void {
  return onSnapshot(query(collection(db, "locations", id, "history"), orderBy("createdAt", "asc")), (snap) =>
    onData(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as HistoryRecord)),
  );
}

export function watchRejectionsLive(
  onData: (rows: RejectionRecord[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "rejections"), orderBy("rejectedAt", "desc")),
    (snap) => onData(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as RejectionRecord)),
    (error) => onError(error),
  );
}

export function watchUsersLive(
  onData: (rows: UserProfile[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "users"), orderBy("email")),
    (snap) => onData(snap.docs.map((item) => ({ ...(item.data() as UserProfile), uid: item.id }))),
    (error) => onError(error),
  );
}

export function watchInvitesLive(
  onData: (rows: InviteRecord[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    query(collection(db, "invites"), orderBy("createdAt", "desc")),
    (snap) => onData(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as InviteRecord)),
    (error) => onError(error),
  );
}
