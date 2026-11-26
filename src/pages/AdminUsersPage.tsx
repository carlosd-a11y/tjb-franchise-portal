import { useEffect, useState, type FormEvent } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useAuth } from "../auth/AuthProvider";
import { Banner, Button, TextField } from "../components/ui";
import { explain, saveInvite, saveUser, updateInviteStatus } from "../lib/api";
import { db } from "../firebase";
import type { InviteRecord, Role, UserProfile } from "../types";

export function AdminUsersPage() {
  const { state } = useAuth();
  const me = state.status === "ready" ? state.profile : null;
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [error, setError] = useState("");
  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("franchisee");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("franchisee");

  useEffect(() => {
    const stopUsers = onSnapshot(
      query(collection(db, "users"), orderBy("email")),
      (snap) => setUsers(snap.docs.map((item) => ({ ...(item.data() as UserProfile), uid: item.id }))),
      (err) => setError(explain(err)),
    );
    const stopInvites = onSnapshot(
      query(collection(db, "invites"), orderBy("createdAt", "desc")),
      (snap) => setInvites(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as InviteRecord)),
      (err) => setError(explain(err)),
    );
    return () => {
      stopUsers();
      stopInvites();
    };
  }, []);

  if (!me) return null;

  async function addUser(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await saveUser({
        uid: uid.trim(),
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role,
        active: true,
      });
      setUid("");
      setEmail("");
      setName("");
    } catch (err) {
      setError(explain(err));
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Users</h1>
      </div>
      <div className="stack">
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <section className="card">
          <h2>Access</h2>
          <p className="hint">Create the Auth user in the Firebase console, mark the email verified, then paste the UID here.</p>
          {users.map((user) => {
            const self = user.uid === me.uid;
            return (
              <div key={user.uid} className="user-row">
                <div className="split">
                  <div className="grow">
                    <strong>{user.name}</strong>
                    <p className="hint">{user.email}</p>
                  </div>
                  <span className="pill">{user.active ? user.role : "inactive"}</span>
                </div>
                <div className="actions">
                  <label className="field grow">
                    <span className="hint">Role</span>
                    <select
                      value={user.role}
                      disabled={self}
                      onChange={(event) => {
                        const next = event.target.value as Role;
                        void saveUser({ ...user, role: next }).catch((err: unknown) => setError(explain(err)));
                      }}
                    >
                      <option value="franchisee">Franchisee</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={self}
                    onClick={() => {
                      void saveUser({ ...user, active: !user.active }).catch((err: unknown) => setError(explain(err)));
                    }}
                  >
                    {user.active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            );
          })}
          <form className="stack" style={{ marginTop: 16 }} onSubmit={(event) => void addUser(event)}>
            <TextField name="uid" label="User ID" value={uid} onChange={(event) => setUid(event.target.value)} required />
            <TextField name="email" label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <TextField name="name" label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
            <label className="field">
              <span>Role</span>
              <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
                <option value="franchisee">Franchisee</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <Button type="submit">Add user</Button>
          </form>
        </section>
        <section className="card">
          <h2>Invites</h2>
          <p className="hint">An invite does not grant access. Provision the Auth user, then mark it done.</p>
          {invites.map((invite) => (
            <div key={invite.id} className="user-row">
              <div className="split">
                <div>
                  <strong>{invite.name}</strong>
                  <p className="hint">
                    {invite.email} · {invite.role}
                  </p>
                </div>
                <span className="pill">{invite.status}</span>
              </div>
              {invite.status === "pending" ? (
                <Button type="button" variant="secondary" onClick={() => void updateInviteStatus(invite.id, "provisioned")}>
                  Mark provisioned
                </Button>
              ) : null}
            </div>
          ))}
          <form
            className="stack"
            style={{ marginTop: 16 }}
            onSubmit={(event) => {
              event.preventDefault();
              void saveInvite(inviteEmail, inviteName.trim(), inviteRole, me.uid)
                .then(() => {
                  setInviteEmail("");
                  setInviteName("");
                })
                .catch((err: unknown) => setError(explain(err)));
            }}
          >
            <TextField name="invite-email" label="Email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required />
            <TextField name="invite-name" label="Name" value={inviteName} onChange={(event) => setInviteName(event.target.value)} required />
            <label className="field">
              <span>Role</span>
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)}>
                <option value="franchisee">Franchisee</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <Button type="submit" variant="secondary">
              Save invite
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}
