import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { watchLocations } from "../data/watch";
import { useAuth } from "../auth/AuthProvider";
import { StatusPill, Banner, Button } from "../components/ui";
import { claimLocation, explain } from "../lib/api";
import { money, sourceLabel, sqft } from "../lib/format";
import { matchesLocation, type LocationFilter } from "../lib/filters";
import { STATUSES, STATUS_LABEL } from "../lib/model";
import { daysLeft, isStaleClaim, toDate } from "../lib/time";
import type { LocationRecord, LocationStatus } from "../types";

export function LocationsPage() {
  const { state } = useAuth();
  const profile = state.status === "ready" ? state.profile : null;
  const [rows, setRows] = useState<LocationRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [filter, setFilter] = useState<LocationFilter>({ scope: "all", status: "any", city: "any" });

  useEffect(() => {
    return watchLocations(
      (rows) => {
        setRows(rows);
        setLoading(false);
      },
      (err) => {
        setError(explain(err));
        setLoading(false);
      },
    );
  }, []);

  const cities = useMemo(
    () => [...new Set(rows.map((row) => row.city))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const visible = useMemo(() => {
    if (!profile) return [];
    return rows.filter((row) => {
      const last = toDate(row.lastActivityAt);
      if (!last) return false;
      return matchesLocation(
        { id: row.id, city: row.city, status: row.status, claimedBy: row.claimedBy, lastActivityAt: last },
        filter,
        profile.uid,
      );
    });
  }, [rows, filter, profile]);

  if (!profile) return null;

  return (
    <>
      <div className="page-head">
        <h1>Locations</h1>
        <Link className="btn btn-primary" to="/locations/new">
          Add
        </Link>
      </div>
      <div className="filters">
        <div className="chips" role="tablist" aria-label="Scope">
          {(
            [
              ["all", "All"],
              ["pool", "Pool"],
              ["mine", "Mine"],
            ] as const
          ).map(([scope, label]) => (
            <button
              key={scope}
              type="button"
              className={`chip${filter.scope === scope ? " on" : ""}`}
              onClick={() => setFilter((current) => ({ ...current, scope }))}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="field grow">
          <span className="hint">Status</span>
          <select
            value={filter.status}
            onChange={(event) =>
              setFilter((current) => ({ ...current, status: event.target.value as LocationStatus | "any" }))
            }
          >
            <option value="any">Any status</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="field grow">
          <span className="hint">City</span>
          <select
            value={filter.city}
            onChange={(event) => setFilter((current) => ({ ...current, city: event.target.value }))}
          >
            <option value="any">Any city</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {loading ? <p>Loading</p> : null}
      {!loading && visible.length === 0 ? <p className="hint">Nothing matches.</p> : null}
      <div className="stack">
        {visible.map((row) => {
          const last = toDate(row.lastActivityAt)!;
          const stale = isStaleClaim(row.status, last);
          const open = row.status === "pool" || (stale && row.claimedBy !== profile.uid);
          return (
            <article key={row.id} className="card">
              <div className="card-top">
                <div>
                  <Link className="card-link" to={`/locations/${row.id}`}>
                    <h2>{row.address}</h2>
                  </Link>
                  <p className="hint">
                    {row.city}, {row.state} {row.zip}
                  </p>
                </div>
                <StatusPill status={row.status} />
              </div>
              <div className="meta">
                <span>{sqft(row.sqft)}</span>
                <span>{money(row.rent)}/mo</span>
                <span>{sourceLabel(row.source)}</span>
                {row.claimedByName && !stale && row.status !== "pool" ? <span>{row.claimedByName}</span> : null}
                <Clock status={row.status} last={last} stale={stale} />
              </div>
              {row.status === "pool" && row.passReason ? <p className="hint">Passed: {row.passReason}</p> : null}
              {open ? (
                <div className="actions" style={{ marginTop: 12 }}>
                  <Button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => {
                      setBusyId(row.id);
                      setError("");
                      void claimLocation(row.id, profile)
                        .catch((err: unknown) => setError(explain(err)))
                        .finally(() => setBusyId(""));
                    }}
                  >
                    {busyId === row.id ? "Claiming" : "Claim"}
                  </Button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}

function Clock({ status, last, stale }: { status: LocationRecord["status"]; last: Date; stale: boolean }) {
  if (status === "pool" || status === "approved" || status === "rejected") return null;
  if (stale) return <span className="clock expired">Open to claim</span>;
  const days = daysLeft(last);
  return <span className={days <= 7 ? "clock soon" : "clock"}>{days}d left</span>;
}
