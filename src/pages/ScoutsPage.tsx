import { useEffect, useState, type FormEvent } from "react";
import { watchScouts } from "../data/watch";
import { Banner, Button, Modal, TextField } from "../components/ui";
import { createScout, deleteScout, explain, rotateScoutKey, updateScout } from "../lib/api";
import { ago } from "../lib/time";
import type { ScoutRecord } from "../types";

/**
 * Admin -> Scouts.
 *
 * A scouting platform (Muse, Grokbot, whatever comes next) is registered here
 * and gets a key. It then posts its finds to the intake endpoint and they land
 * in the pool tagged with its name. Adding one used to mean editing a file on
 * the server and restarting it.
 *
 * A key is shown once, when it is made or rotated, because only its hash is
 * stored. If it is lost, rotate and paste the new one in.
 */
export function ScoutsPage() {
  const [scouts, setScouts] = useState<ScoutRecord[]>([]);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ label: string; key: string } | null>(null);
  const [removing, setRemoving] = useState<ScoutRecord | null>(null);

  useEffect(
    () =>
      watchScouts(
        (next) => setScouts(next),
        (err) => setError(explain(err)),
      ),
    [],
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const key = await createScout(name, label);
      setIssued({ label: label.trim(), key });
      setLabel("");
      setName("");
    });
  }

  /** "Grok Bot" -> "grok-bot", so the short name is one less thing to think about. */
  function suggestName(value: string) {
    setLabel(value);
    setName(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24),
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Scouts</h1>
      </div>
      <div className="stack">
        {error ? <Banner tone="bad">{error}</Banner> : null}

        <section className="card">
          <h2>Connected platforms</h2>
          <p className="hint">
            Each platform posts what it finds to <code>/api/intake</code> with its own key. Finds land
            in the pool, tagged with the platform that found them, and an address already on the list
            is refused rather than added twice.
          </p>

          {scouts.length === 0 ? (
            <p className="hint">No scouts yet. Add one below.</p>
          ) : (
            scouts.map((scout) => (
              <div key={scout.id} className="user-row">
                <div className="split">
                  <div className="grow">
                    <strong>{scout.label}</strong>
                    <p className="hint">
                      Tagged <code>bot:{scout.name}</code> · {scout.submitted}{" "}
                      {scout.submitted === 1 ? "site" : "sites"} ·{" "}
                      {scout.lastSeenAt ? `last sent ${ago(scout.lastSeenAt.toDate())}` : "never sent anything"}
                    </p>
                  </div>
                  <span className="pill">{scout.active ? "On" : "Paused"}</span>
                </div>
                <div className="actions">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(() => updateScout(scout.id, { active: !scout.active }))
                    }
                  >
                    {scout.active ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const key = await rotateScoutKey(scout.id);
                        setIssued({ label: scout.label, key });
                      })
                    }
                  >
                    New key
                  </Button>
                  <Button type="button" variant="quiet" disabled={busy} onClick={() => setRemoving(scout)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </section>

        <section className="card">
          <h2>Add a scout</h2>
          <form className="stack" onSubmit={(event) => void add(event)}>
            <TextField
              name="scout-label"
              label="Platform"
              value={label}
              onChange={(event) => suggestName(event.target.value)}
              placeholder="Muse"
              required
            />
            <TextField
              name="scout-name"
              label="Short name"
              value={name}
              onChange={(event) => setName(event.target.value.toLowerCase())}
              maxLength={24}
              required
            />
            <p className="hint">
              The short name is what finds are tagged with and cannot be changed later. Lowercase
              letters, numbers and dashes.
            </p>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding" : "Add scout"}
            </Button>
          </form>
        </section>
      </div>

      {issued ? (
        <Modal title={`Key for ${issued.label}`} onClose={() => setIssued(null)}>
          <Banner tone="warn">
            Copy this now. It is shown once and cannot be retrieved — only a hash of it is kept.
          </Banner>
          <p className="hint">Paste it into the platform as its bearer token:</p>
          <pre className="key-box">{issued.key}</pre>
          <div className="actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(issued.key).catch(() => {})}
            >
              Copy
            </Button>
            <Button type="button" onClick={() => setIssued(null)}>
              Done
            </Button>
          </div>
        </Modal>
      ) : null}

      {removing ? (
        <Modal title={`Remove ${removing.label}`} onClose={() => setRemoving(null)}>
          <p>
            Its key stops working straight away. The {removing.submitted}{" "}
            {removing.submitted === 1 ? "site it has" : "sites it has"} already sent stay on the list.
          </p>
          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await deleteScout(removing.id);
                setRemoving(null);
              })
            }
          >
            Remove scout
          </Button>
        </Modal>
      ) : null}
    </>
  );
}
