import { isDemo, useServer } from "../env";
import { getDemoDb } from "../demo/database";
import type { HistoryRecord, InviteRecord, LocationRecord, NoteRecord, RejectionRecord, UserProfile } from "../types";

function liveWatch(): Promise<typeof import("./firebaseWatch")> {
  return useServer ? import("./httpWatch") : import("./firebaseWatch");
}

export function watchLocations(
  onData: (rows: LocationRecord[]) => void,
  onError: (error: unknown) => void,
): () => void {
  if (isDemo) {
    const db = getDemoDb();
    const push = () => onData(db.locations());
    push();
    return db.subscribe(push);
  }
  let stop = () => {};
  let cancelled = false;
  void liveWatch().then((mod) => {
    if (cancelled) return;
    stop = mod.watchLocationsLive(onData, onError);
  });
  return () => {
    cancelled = true;
    stop();
  };
}

export function watchLocation(
  id: string,
  onData: (row: LocationRecord | null) => void,
  onError: (error: unknown) => void,
): () => void {
  if (isDemo) {
    const db = getDemoDb();
    const push = () => onData(db.location(id));
    push();
    return db.subscribe(push);
  }
  let stop = () => {};
  let cancelled = false;
  void liveWatch().then((mod) => {
    if (cancelled) return;
    stop = mod.watchLocationLive(id, onData, onError);
  });
  return () => {
    cancelled = true;
    stop();
  };
}

export function watchNotes(id: string, onData: (rows: NoteRecord[]) => void): () => void {
  if (isDemo) {
    const db = getDemoDb();
    const push = () => onData(db.notes(id));
    push();
    return db.subscribe(push);
  }
  let stop = () => {};
  let cancelled = false;
  void liveWatch().then((mod) => {
    if (cancelled) return;
    stop = mod.watchNotesLive(id, onData);
  });
  return () => {
    cancelled = true;
    stop();
  };
}

export function watchHistory(id: string, onData: (rows: HistoryRecord[]) => void): () => void {
  if (isDemo) {
    const db = getDemoDb();
    const push = () => onData(db.history(id));
    push();
    return db.subscribe(push);
  }
  let stop = () => {};
  let cancelled = false;
  void liveWatch().then((mod) => {
    if (cancelled) return;
    stop = mod.watchHistoryLive(id, onData);
  });
  return () => {
    cancelled = true;
    stop();
  };
}

export function watchRejections(
  onData: (rows: RejectionRecord[]) => void,
  onError: (error: unknown) => void,
): () => void {
  if (isDemo) {
    const db = getDemoDb();
    const push = () => onData(db.rejections());
    push();
    return db.subscribe(push);
  }
  let stop = () => {};
  let cancelled = false;
  void liveWatch().then((mod) => {
    if (cancelled) return;
    stop = mod.watchRejectionsLive(onData, onError);
  });
  return () => {
    cancelled = true;
    stop();
  };
}

export function watchUsers(onData: (rows: UserProfile[]) => void, onError: (error: unknown) => void): () => void {
  if (isDemo) {
    const db = getDemoDb();
    const push = () => onData(db.users());
    push();
    return db.subscribe(push);
  }
  let stop = () => {};
  let cancelled = false;
  void liveWatch().then((mod) => {
    if (cancelled) return;
    stop = mod.watchUsersLive(onData, onError);
  });
  return () => {
    cancelled = true;
    stop();
  };
}

export function watchInvites(
  onData: (rows: InviteRecord[]) => void,
  onError: (error: unknown) => void,
): () => void {
  if (isDemo) {
    const db = getDemoDb();
    const push = () => onData(db.invites());
    push();
    return db.subscribe(push);
  }
  let stop = () => {};
  let cancelled = false;
  void liveWatch().then((mod) => {
    if (cancelled) return;
    stop = mod.watchInvitesLive(onData, onError);
  });
  return () => {
    cancelled = true;
    stop();
  };
}
