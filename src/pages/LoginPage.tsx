import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { authMessage } from "../auth/authErrors";
import { Banner, Button, TextField } from "../components/ui";
import { useEmulators } from "../env";

const DEMO_PASSWORD = "DemoPassw0rd!";

export function LoginPage() {
  const { state, signIn, completeChallenge } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (state.status === "ready") return <Navigate to="/locations" replace />;
  if (state.status === "needs-mfa") return <Navigate to="/mfa" replace />;
  if (state.status === "no-access") return <Navigate to="/locations" replace />;
  if (state.status === "loading" || state.status === "unconfigured") {
    return (
      <div className="center-screen">
        <p>{state.status === "loading" ? "Loading" : "Firebase config is missing. Copy .env.example."}</p>
      </div>
    );
  }

  async function submitPassword(nextEmail: string, nextPassword: string) {
    setBusy(true);
    setError("");
    try {
      await signIn(nextEmail, nextPassword);
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await completeChallenge(code);
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="auth-card">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Tropical Juice Bar
        </span>
        <h1>{state.status === "mfa-challenge" ? "Authenticator" : "Sign in"}</h1>
        <p className="lede">
          {state.status === "mfa-challenge"
            ? "Enter the 6-digit code from your authenticator app."
            : "Invite only. Franchisee locations."}
        </p>
        {error ? <Banner tone="bad">{error}</Banner> : null}
        {state.status === "mfa-challenge" ? (
          <form
            className="stack"
            onSubmit={(event) => void submitCode(event)}
            style={{ marginTop: 16 }}
          >
            <TextField
              name="code"
              label="Code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Checking" : "Continue"}
            </Button>
          </form>
        ) : (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void submitPassword(email, password);
            }}
            style={{ marginTop: 16 }}
          >
            <TextField
              name="email"
              label="Email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <TextField
              name="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Signing in" : "Sign in"}
            </Button>
          </form>
        )}
        {useEmulators && state.status === "signed-out" ? (
          <div className="stack" style={{ marginTop: 18 }}>
            <p className="hint">Emulator demo. MFA is off. Password {DEMO_PASSWORD}</p>
            <div className="demo-row">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void submitPassword("alex@tropicaljuice.test", DEMO_PASSWORD)}
              >
                Demo franchisee
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void submitPassword("admin@tropicaljuice.test", DEMO_PASSWORD)}
              >
                Demo admin
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
