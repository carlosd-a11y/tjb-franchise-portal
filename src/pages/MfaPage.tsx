import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import {
  EmailAuthProvider,
  multiFactor,
  reauthenticateWithCredential,
  sendEmailVerification,
  TotpMultiFactorGenerator,
  type TotpSecret,
} from "firebase/auth";
import QRCode from "qrcode";
import { mfaSetupMessage, useAuth } from "../auth/AuthProvider";
import { Banner, Button, TextField } from "../components/ui";
import { auth } from "../firebase";

export function MfaPage() {
  const { state, signOutUser, noteMfaEnrolled } = useAuth();
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [needPassword, setNeedPassword] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (state.status === "signed-out" || state.status === "mfa-challenge") return <Navigate to="/login" replace />;
  if (state.status === "ready") return <Navigate to="/locations" replace />;
  if (state.status === "no-access") return <Navigate to="/locations" replace />;
  if (state.status !== "needs-mfa") {
    return (
      <div className="center-screen">
        <p>Loading</p>
      </div>
    );
  }

  const user = auth.currentUser;

  async function generate() {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      if (!user.emailVerified) {
        setInfo("This email is not verified yet.");
        return;
      }
      const session = await multiFactor(user).getSession();
      const next = await TotpMultiFactorGenerator.generateSecret(session);
      const url = next.generateQrCodeUrl(user.email ?? "franchisee", "Tropical Juice Bar");
      setSecret(next);
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 220 }));
    } catch (err) {
      const firebaseCode = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      if (firebaseCode === "auth/requires-recent-login") {
        setNeedPassword(true);
        setError("Enter your password again, then retry.");
      } else {
        setError(mfaSetupMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function reauth(event: FormEvent) {
    event.preventDefault();
    if (!user?.email) return;
    setBusy(true);
    setError("");
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      setNeedPassword(false);
      setPassword("");
      await generate();
    } catch (err) {
      setError(mfaSetupMessage(err));
      setBusy(false);
    }
  }

  async function enroll(event: FormEvent) {
    event.preventDefault();
    if (!user || !secret) return;
    setBusy(true);
    setError("");
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim());
      await multiFactor(user).enroll(assertion, "Authenticator app");
      await user.reload();
      noteMfaEnrolled();
    } catch (err) {
      setError(mfaSetupMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="auth-card stack">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Tropical Juice Bar
        </span>
        <h1>Set up MFA</h1>
        <p className="lede">Scan the QR code with an authenticator app, then enter the 6-digit code.</p>
        {info ? <Banner tone="info">{info}</Banner> : null}
        {error ? <Banner tone="bad">{error}</Banner> : null}
        {user && !user.emailVerified ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void sendEmailVerification(user).then(
                () => setInfo("Verification email sent."),
                (err: unknown) => setError(mfaSetupMessage(err)),
              );
            }}
          >
            Send verification email
          </Button>
        ) : null}
        {needPassword ? (
          <form className="stack" onSubmit={(event) => void reauth(event)}>
            <TextField
              name="password"
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button type="submit" disabled={busy}>
              Continue
            </Button>
          </form>
        ) : null}
        {!secret ? (
          <Button type="button" disabled={busy || !user?.emailVerified} onClick={() => void generate()}>
            {busy ? "Starting" : "Create QR code"}
          </Button>
        ) : (
          <form className="stack" onSubmit={(event) => void enroll(event)}>
            {qr ? <img className="qr" src={qr} alt="Authenticator QR code" /> : null}
            <div>
              <p className="hint">Or enter this key manually.</p>
              <p className="pass-box">{secret.secretKey}</p>
            </div>
            <TextField
              name="code"
              label="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Saving" : "Enable authenticator"}
            </Button>
          </form>
        )}
        <Button type="button" variant="quiet" onClick={() => void signOutUser()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
