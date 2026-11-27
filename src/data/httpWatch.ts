import {
  fetchInvites,
  fetchLocationPage,
  fetchLocations,
  fetchRejections,
  fetchUsers,
} from "../lib/httpApi";
import type { HistoryRecord, InviteRecord, LocationRecord, NoteRecord, RejectionRecord, UserProfile } from "../types";

/**
 * Firestore pushed changes. This asks instead.
 *
 * Every twenty seconds while the tab is in front, and once more as soon as it
 * comes back. Someone else's claim can therefore show up to twenty seconds
 * late. The claim itself is still decided by a transaction on the server, so a
 * stale screen cannot cause two people to win the same site.
 */

const EVERY_MS = 20_000;

function poll<T>(load: () => Promise<T>, onData: (value: T) => void, onError?: (error: unknown) => void) {
  let stopped = false;

  const run = () => {
    if (stopped) return;
    void load().then(
      (value) => {
        if (!stopped) onData(value);
      },
      (error) => {
        if (!stopped && onError) onError(error);
      },
    );
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") run();
  };

  run();
  const timer = window.setInterval(() => {
    if (document.visibilityState === "visible") run();
  }, EVERY_MS);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export function watchLocationsLive(
  onData: (rows: LocationRecord[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return poll(fetchLocations, onData, onError);
}

export function watchLocationLive(
  id: string,
  onData: (row: LocationRecord | null) => void,
  onError: (error: unknown) => void,
): () => void {
  return poll(() => fetchLocationPage(id), (page) => onData(page ? page.location : null), onError);
}

export function watchNotesLive(id: string, onData: (rows: NoteRecord[]) => void): () => void {
  return poll(() => fetchLocationPage(id), (page) => onData(page ? page.notes : []));
}

export function watchHistoryLive(id: string, onData: (rows: HistoryRecord[]) => void): () => void {
  return poll(() => fetchLocationPage(id), (page) => onData(page ? page.history : []));
}

export function watchRejectionsLive(
  onData: (rows: RejectionRecord[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return poll(fetchRejections, onData, onError);
}

export function watchUsersLive(
  onData: (rows: UserProfile[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return poll(fetchUsers, onData, onError);
}

export function watchInvitesLive(
  onData: (rows: InviteRecord[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return poll(fetchInvites, onData, onError);
}
