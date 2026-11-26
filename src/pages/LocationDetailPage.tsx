import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { useAuth } from "../auth/AuthProvider";
import { RejectionWarning } from "../components/RejectionWarning";
import { Banner, Button, Modal, StatusPill, TextArea } from "../components/ui";
import {
  addNote,
  advanceLocation,
  approveLocation,
  claimLocation,
  deleteLocation,
  explain,
  findRejectionHits,
  keepLocation,
  passLocation,
  rejectLocation,
  updateNote,
} from "../lib/api";
import { money, sourceLabel, sqft } from "../lib/format";
import { ACTIVE_CLAIM_STATUSES, ADVANCE_LABEL, NEXT_STATUS, REASON_CODES, REASON_LABEL, STATUS_LABEL } from "../lib/model";
import { ago, daysLeft, formatWhen, isClaimable, isStaleClaim, toDate } from "../lib/time";
import { isReasonCode, parseNote, parsePassReason } from "../lib/validators";
import { db } from "../firebase";
import type { HistoryRecord, LocationRecord, NoteRecord, ReasonCode, RejectionHit } from "../types";

export function LocationDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { state } = useAuth();
  const profile = state.status === "ready" ? state.profile : null;
  const [location, setLocation] = useState<LocationRecord | null | undefined>(undefined);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [hits, setHits] = useState<RejectionHit[]>([]);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState("");
  const [editText, setEditText] = useState("");
  const [modal, setModal] = useState<"" | "pass" | "reject" | "approve" | "delete">("");
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState<ReasonCode>("rent");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onSnapshot(
      doc(db, "locations", id),
      (snap) => {
        setLocation(snap.exists() ? ({ id: snap.id, ...snap.data() } as LocationRecord) : null);
      },
      (err) => setError(explain(err)),
    );
  }, [id]);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "locations", id, "notes"), orderBy("createdAt", "asc")),
      (snap) => setNotes(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as NoteRecord)),
    );
  }, [id]);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "locations", id, "history"), orderBy("createdAt", "asc")),
      (snap) => setHistory(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as HistoryRecord)),
    );
  }, [id]);

  useEffect(() => {
    if (!location) return;
    let cancel = false;
    void findRejectionHits(location.normalizedAddress, location.zip).then((next) => {
      if (!cancel) setHits(next);
    });
    return () => {
      cancel = true;
    };
  }, [location]);

  if (!profile) return null;
  if (location === undefined) return <p>Loading</p>;
  if (location === null) return <p>Location not found.</p>;

  const last = toDate(location.lastActivityAt);
  const stale = last ? isStaleClaim(location.status, last) : false;
  const claimable = isClaimable(location.status, last);
  const isOwner = location.claimedBy === profile.uid;
  const working =
    (isOwner || profile.role === "admin") &&
    (ACTIVE_CLAIM_STATUSES as string[]).includes(location.status);
  const next = NEXT_STATUS[location.status];

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setModal("");
      setReason("");
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <Link className="hint" to="/locations">
            Locations
          </Link>
          <h1>{location.address}</h1>
          <p className="hint">
            {location.city}, {location.state} {location.zip}
          </p>
        </div>
        <StatusPill status={location.status} />
      </div>
      <div className="stack">
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <RejectionWarning hits={hits} />
        <section className="card">
          <div className="meta">
            <span>{sqft(location.sqft)}</span>
            <span>{money(location.rent)}/mo</span>
            <span>{sourceLabel(location.source)}</span>
            {location.claimedByName ? <span>{location.claimedByName}</span> : null}
            {last && location.status !== "pool" && location.status !== "approved" && location.status !== "rejected" ? (
              stale ? (
                <span className="clock expired">Open to claim</span>
              ) : (
                <span className={daysLeft(last) <= 7 ? "clock soon" : "clock"}>{daysLeft(last)}d left</span>
              )
            ) : null}
            {last ? <span>Activity {ago(last)}</span> : null}
          </div>
          {location.lat !== null && location.lng !== null ? (
            <p style={{ marginTop: 8 }}>
              <a href={`https://maps.google.com/?q=${location.lat},${location.lng}`} target="_blank" rel="noreferrer">
                Map
              </a>
            </p>
          ) : null}
          {location.status === "pool" && location.passReason ? (
            <p className="hint">Last pass: {location.passReason}</p>
          ) : null}
          <div className="actions" style={{ marginTop: 14 }}>
            {claimable && location.claimedBy !== profile.uid ? (
              <Button type="button" disabled={busy} onClick={() => void run(() => claimLocation(id, profile))}>
                Claim
              </Button>
            ) : null}
            {working && next && ADVANCE_LABEL[location.status] ? (
              <Button type="button" disabled={busy} onClick={() => void run(() => advanceLocation(id, profile))}>
                {ADVANCE_LABEL[location.status]}
              </Button>
            ) : null}
            {working ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(() => keepLocation(id))}>
                Keep
              </Button>
            ) : null}
            {working ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setModal("pass")}>
                Pass
              </Button>
            ) : null}
            {profile.role === "admin" && location.status === "submitted" ? (
              <Button type="button" disabled={busy} onClick={() => setModal("approve")}>
                Approve
              </Button>
            ) : null}
            {profile.role === "admin" && location.status !== "approved" && location.status !== "rejected" ? (
              <Button type="button" variant="danger" disabled={busy} onClick={() => setModal("reject")}>
                Reject
              </Button>
            ) : null}
            {profile.role === "admin" ? (
              <Button type="button" variant="quiet" disabled={busy} onClick={() => setModal("delete")}>
                Delete
              </Button>
            ) : null}
          </div>
        </section>

        <section className="section">
          <h2>Notes</h2>
          <div className="card">
            {notes.length === 0 ? <p className="hint">No notes yet.</p> : null}
            {notes.map((item) => {
              const when = toDate(item.createdAt);
              return (
                <article key={item.id} className="note">
                  <div className="note-head">
                    <strong>{item.authorName}</strong>
                    <span>{when ? ago(when) : ""}</span>
                  </div>
                  {editing === item.id ? (
                    <form
                      className="stack"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const text = parseNote(editText);
                        if (!text) {
                          setError("Write a note under 2,000 characters.");
                          return;
                        }
                        void run(async () => {
                          await updateNote(id, item.id, text);
                          setEditing("");
                        });
                      }}
                    >
                      <TextArea label="Note" name="edit-note" value={editText} onChange={(event) => setEditText(event.target.value)} />
                      <div className="actions">
                        <Button type="submit" disabled={busy}>
                          Save
                        </Button>
                        <Button type="button" variant="quiet" onClick={() => setEditing("")}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p>{item.text}</p>
                      {item.authorUid === profile.uid ? (
                        <Button
                          type="button"
                          variant="quiet"
                          onClick={() => {
                            setEditing(item.id);
                            setEditText(item.text);
                          }}
                        >
                          Edit
                        </Button>
                      ) : null}
                    </>
                  )}
                </article>
              );
            })}
            <form
              className="stack"
              style={{ marginTop: 12 }}
              onSubmit={(event) => {
                event.preventDefault();
                const text = parseNote(note);
                if (!text) {
                  setError("Write a note under 2,000 characters.");
                  return;
                }
                void run(async () => {
                  await addNote(id, profile, text);
                  setNote("");
                });
              }}
            >
              <TextArea label="Add a note" name="note" value={note} onChange={(event) => setNote(event.target.value)} />
              <Button type="submit" variant="secondary" disabled={busy}>
                Add note
              </Button>
            </form>
          </div>
        </section>

        <section className="section">
          <h2>History</h2>
          <div className="card">
            {history.length === 0 ? <p className="hint">No status changes yet.</p> : null}
            <ul className="timeline">
              {history.map((item) => {
                const when = toDate(item.createdAt);
                return (
                  <li key={item.id}>
                    <span className="dot" aria-hidden="true" />
                    <div>
                      <strong>
                        {STATUS_LABEL[item.fromStatus]} → {item.toStatus === "pool" && item.reason ? "Passed" : STATUS_LABEL[item.toStatus]}
                      </strong>
                      <p className="hint">
                        {item.actorName}
                        {when ? ` · ${formatWhen(when)}` : ""}
                      </p>
                      {item.reason ? <p>{item.reason}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>

      {modal === "pass" ? (
        <Modal title="Pass" onClose={() => setModal("")}>
          <p className="hint">It returns to the pool. A reason is required.</p>
          <TextArea label="Reason" name="pass-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              const parsed = parsePassReason(reason);
              if (!parsed) {
                setError("Give a reason, at least a few words.");
                return;
              }
              void run(() => passLocation(id, profile, parsed));
            }}
          >
            Return to pool
          </Button>
        </Modal>
      ) : null}
      {modal === "reject" ? (
        <Modal title="Reject" onClose={() => setModal("")}>
          <label className="field">
            <span>Reason</span>
            <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as ReasonCode)}>
              {REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {REASON_LABEL[code]}
                </option>
              ))}
            </select>
          </label>
          <TextArea label="Details" name="reject-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() => {
              const text = parsePassReason(reason);
              if (!text || !isReasonCode(reasonCode)) {
                setError("Add a short explanation.");
                return;
              }
              void run(() => rejectLocation(id, profile, reasonCode, text));
            }}
          >
            Reject location
          </Button>
        </Modal>
      ) : null}
      {modal === "approve" ? (
        <Modal title="Approve" onClose={() => setModal("")}>
          <p>Mark this location approved?</p>
          <Button type="button" disabled={busy} onClick={() => void run(() => approveLocation(id, profile))}>
            Approve
          </Button>
        </Modal>
      ) : null}
      {modal === "delete" ? (
        <Modal title="Delete" onClose={() => setModal("")}>
          <p>Delete this location, its notes, and its history?</p>
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await deleteLocation(id);
                navigate("/locations");
              })
            }
          >
            Delete
          </Button>
        </Modal>
      ) : null}
    </>
  );
}
