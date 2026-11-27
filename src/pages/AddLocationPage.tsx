import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { RejectionWarning } from "../components/RejectionWarning";
import { Banner, Button, TextField } from "../components/ui";
import { createLocation, explain, findRejectionHits } from "../lib/api";
import { parseDraftLocation, type DraftLocation } from "../lib/validators";
import type { RejectionHit } from "../types";

const empty: DraftLocation = {
  address: "",
  city: "",
  state: "FL",
  zip: "",
  sqft: "",
  rent: "",
  lat: "",
  lng: "",
  listingUrl: "",
  contactName: "",
  contactPhone: "",
};

export function AddLocationPage() {
  const { state } = useAuth();
  const profile = state.status === "ready" ? state.profile : null;
  const navigate = useNavigate();
  const [draft, setDraft] = useState<DraftLocation>(empty);
  const [hits, setHits] = useState<RejectionHit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const parsed = parseDraftLocation(draft);
    if ("error" in parsed) {
      setHits([]);
      return;
    }
    let cancel = false;
    const timer = window.setTimeout(() => {
      void findRejectionHits(parsed.value.normalizedAddress, parsed.value.zip)
        .then((next) => {
          if (!cancel) setHits(next);
        })
        .catch(() => {
          if (!cancel) setHits([]);
        });
    }, 250);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [draft]);

  if (!profile) return null;

  function set<K extends keyof DraftLocation>(key: K, value: DraftLocation[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseDraftLocation(draft);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const id = await createLocation(profile!, parsed.value);
      navigate(`/locations/${id}`);
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Add location</h1>
        <Link className="btn btn-secondary" to="/locations">
          Back
        </Link>
      </div>
      <form className="card stack" onSubmit={(event) => void submit(event)}>
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <RejectionWarning hits={hits} />
        {hits.length > 0 ? <p className="hint">You can still add it.</p> : null}
        <TextField name="address" label="Address" value={draft.address} onChange={(event) => set("address", event.target.value)} required />
        <div className="grid-2">
          <TextField name="city" label="City" value={draft.city} onChange={(event) => set("city", event.target.value)} required />
          <TextField
            name="state"
            label="State"
            value={draft.state}
            maxLength={2}
            onChange={(event) => set("state", event.target.value.toUpperCase())}
            required
          />
        </div>
        <div className="grid-2">
          <TextField name="zip" label="ZIP" inputMode="numeric" value={draft.zip} onChange={(event) => set("zip", event.target.value)} required />
          <TextField name="sqft" label="Sq ft" inputMode="numeric" value={draft.sqft} onChange={(event) => set("sqft", event.target.value)} required />
        </div>
        <TextField
          name="rent"
          label="Monthly rent"
          inputMode="numeric"
          hint="Dollars."
          value={draft.rent}
          onChange={(event) => set("rent", event.target.value)}
          required
        />
        <div className="grid-2">
          <TextField name="lat" label="Latitude" hint="Optional." value={draft.lat} onChange={(event) => set("lat", event.target.value)} />
          <TextField name="lng" label="Longitude" hint="Optional." value={draft.lng} onChange={(event) => set("lng", event.target.value)} />
        </div>
        <TextField name="listingUrl" label="Listing link (optional)" type="url" value={draft.listingUrl} onChange={(event) => set("listingUrl", event.target.value)} />
        <div className="grid-2">
          <TextField name="contactName" label="Contact name (optional)" value={draft.contactName} onChange={(event) => set("contactName", event.target.value)} />
          <TextField name="contactPhone" label="Contact phone (optional)" type="tel" value={draft.contactPhone} onChange={(event) => set("contactPhone", event.target.value)} />
        </div>
        <p className="hint">Contacts are shown to admins and to whoever claims the site.</p>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving" : "Save to pool"}
        </Button>
      </form>
    </>
  );
}
