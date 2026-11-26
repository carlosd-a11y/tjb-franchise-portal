import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Banner } from "../components/ui";
import { explain } from "../lib/api";
import { REASON_CODES, REASON_LABEL } from "../lib/model";
import { formatWhen, toDate } from "../lib/time";
import { db } from "../firebase";
import type { ReasonCode, RejectionRecord } from "../types";

export function RejectionsPage() {
  const [rows, setRows] = useState<RejectionRecord[]>([]);
  const [reason, setReason] = useState<ReasonCode | "any">("any");
  const [error, setError] = useState("");

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "rejections"), orderBy("rejectedAt", "desc")),
      (snap) => setRows(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as RejectionRecord)),
      (err) => setError(explain(err)),
    );
  }, []);

  const visible = useMemo(
    () => rows.filter((row) => reason === "any" || row.reasonCode === reason),
    [rows, reason],
  );

  return (
    <>
      <div className="page-head">
        <h1>Rejected</h1>
      </div>
      <div className="chips" style={{ marginBottom: 14 }}>
        <button type="button" className={`chip${reason === "any" ? " on" : ""}`} onClick={() => setReason("any")}>
          All
        </button>
        {REASON_CODES.map((code) => (
          <button
            key={code}
            type="button"
            className={`chip${reason === code ? " on" : ""}`}
            onClick={() => setReason(code)}
          >
            {REASON_LABEL[code]}
          </button>
        ))}
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Address</th>
              <th>When</th>
              <th>Reason</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const when = toDate(row.rejectedAt);
              return (
                <tr key={row.id}>
                  <td>
                    {row.address}
                    <div className="hint">
                      {row.city}, {row.state} {row.zip}
                    </div>
                  </td>
                  <td>{when ? formatWhen(when) : ""}</td>
                  <td>{REASON_LABEL[row.reasonCode]}</td>
                  <td>{row.reasonText}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 ? <p className="hint">No rows.</p> : null}
      </div>
    </>
  );
}
