import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebaseLive";
import { authMessage } from "../auth/authErrors";
import { Banner, Button, TextField } from "../components/ui";
import { acceptInvite, readInvite, type InviteDetails } from "../lib/invite";

/**
 * Setting a password, from the link in the invitation email.
 *
 * Firebase takes the password; it never reaches this server. The link is then
 * exchanged for portal access, which is what the rest of the app checks.
 *
 * The address is fixed to the one that was invited and cannot be edited: the
 * server refuses anything else, so letting it be typed would only invite a
 * confusing failure at the end.
 */
export function InvitePage() {
  const { token = "" } = useParams();
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loadError, setLoadError] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    readInvite(token)
      .then((details) => live && setInvite(details))
      .catch((err: Error) => live && setLoadError(err.message));
    return () => {
      live = false;
    };
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!invite) return;
    if (password.length < 10) {
      setError("Use at least 10 characters.");
      return;
    }
    if (password !== again) {
      setError("The two passwords do not match.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      try {
        await createUserWithEmailAndPassword(auth, invite.email, password);
      } catch (err) {
        // Someone who got halfway and came back: the Firebase account exists,
        // so sign in with it instead of failing on "email already in use".
        if ((err as { code?: string }).code !== "auth/email-already-in-use") throw err;
        await signInWithEmailAndPassword(auth, invite.email, password);
      }
      const user = auth.currentUser;
      if (!user) throw new Error("Could not sign in. Try again.");
      await acceptInvite(token, await user.getIdToken());
      setDone(true);
      window.location.replace("/locations");
    } catch (err) {
      setError(err instanceof Error && !(err as { code?: string }).code ? err.message : authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="center-screen">
        <div className="auth-card stack">
          <span className="brand">
            <img className="brand-mark" src="/tjb-mark.png" alt="" />
            Tropical Juice Bar
          </span>
          <h1>This link did not work</h1>
          <p className="lede">{loadError}</p>
          <p className="hint">Ask whoever invited you to send a new one.</p>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="center-screen">
        <p>Loading</p>
      </div>
    );
  }

  return (
    <div className="center-screen">
      <div className="auth-card">
        <span className="brand">
          <img className="brand-mark" src="/tjb-mark.png" alt="" />
          Tropical Juice Bar
        </span>
        <h1>Welcome, {invite.name.split(" ")[0]}</h1>
        <p className="lede">
          Choose a password for <strong>{invite.email}</strong> and you are in.
        </p>
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <form className="stack" onSubmit={(event) => void submit(event)} style={{ marginTop: 16 }}>
          <TextField
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <TextField
            name="again"
            label="Password again"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
            required
          />
          <p className="hint">At least 10 characters. A phrase you will remember beats a short tangle.</p>
          <Button type="submit" disabled={busy || done}>
            {busy ? "Setting up" : done ? "Done" : "Set password and sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
