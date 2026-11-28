import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Banner, Button, TextArea } from "../components/ui";
import { explain, fetchPage, savePage } from "../lib/api";

const SLUG = "site-criteria";

type Section = { title: string; items: { bullet: boolean; text: string }[] };

/** "## " starts a card, "- " is a bullet. Rendered as text, never as HTML. */
function sections(body: string): Section[] {
  const result: Section[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) {
      result.push({ title: line.slice(3), items: [] });
      continue;
    }
    if (!result.length) result.push({ title: "", items: [] });
    const bullet = line.startsWith("- ");
    result[result.length - 1].items.push({ bullet, text: bullet ? line.slice(2) : line });
  }
  return result;
}

export function CriteriaPage() {
  const { state } = useAuth();
  const admin = state.status === "ready" && state.profile.role === "admin";
  const [body, setBody] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchPage(SLUG).then(setBody, (err) => setError(explain(err)));
  }, []);

  async function save(text: string) {
    setBusy(true);
    setError("");
    try {
      await savePage(SLUG, text);
      setBody(text);
      setDraft(null);
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Site criteria</h1>
        {admin && body !== null && draft === null ? (
          <Button type="button" variant="secondary" onClick={() => setDraft(body)}>
            Edit
          </Button>
        ) : null}
      </div>
      <div className="stack">
        {error ? <Banner tone="bad">{error}</Banner> : null}
        {draft !== null ? (
          <section className="card stack">
            <p className="hint">Start a section with "## " and a bullet with "- ".</p>
            <TextArea label="Page text" name="criteria" rows={24} value={draft} onChange={(event) => setDraft(event.target.value)} />
            <div className="actions">
              <Button type="button" disabled={busy} onClick={() => void save(draft)}>
                {busy ? "Saving" : "Save"}
              </Button>
              <Button type="button" variant="quiet" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </section>
        ) : body === null ? (
          error ? null : <p>Loading</p>
        ) : body.trim() === "" ? (
          <p className="hint">Nothing here yet.</p>
        ) : (
          sections(body).map((section, index) => (
            <section className="card" key={index}>
              {section.title ? <h2>{section.title}</h2> : null}
              {section.items.map((item, i) => (
                <p key={i} style={item.bullet ? { paddingLeft: 16, textIndent: -12 } : undefined}>
                  {item.bullet ? "• " : ""}
                  {item.text}
                </p>
              ))}
            </section>
          ))
        )}
      </div>
    </>
  );
}
