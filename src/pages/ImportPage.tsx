import { useState } from "react";
import sampleCsv from "../../samples/rejections-sample.csv?raw";
import { Banner, Button } from "../components/ui";
import { explain, importRejections } from "../lib/api";
import { parseRejectionCsv, type CsvRejection } from "../lib/csv";
import { REASON_LABEL } from "../lib/model";

export function ImportPage() {
  const [rows, setRows] = useState<CsvRejection[]>([]);
  const [issues, setIssues] = useState<{ row: number; message: string }[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function load(text: string) {
    const parsed = parseRejectionCsv(text);
    setRows(parsed.rows);
    setIssues(parsed.issues);
    setMessage("");
    setError("");
  }

  return (
    <>
      <div className="page-head">
        <h1>Import rejections</h1>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            const blob = new Blob([sampleCsv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "rejections-sample.csv";
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          Sample CSV
        </button>
      </div>
      <div className="stack">
        <p className="hint">Columns: address, city, state, zip, rejectedBy, rejectedAt, reasonCode, reasonText. The sample rows are fake.</p>
        {error ? <Banner tone="bad">{error}</Banner> : null}
        {message ? <Banner tone="info">{message}</Banner> : null}
        <label className="field">
          <span>CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 200_000) {
                setError("File is too large.");
                return;
              }
              void file.text().then(load);
            }}
          />
        </label>
        {issues.length > 0 ? (
          <Banner tone="warn">
            Fix the file before importing.
            <ul>
              {issues.slice(0, 8).map((issue) => (
                <li key={`${issue.row}-${issue.message}`}>
                  Row {issue.row}: {issue.message}
                </li>
              ))}
            </ul>
          </Banner>
        ) : null}
        {rows.length > 0 ? (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Reason</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((row) => (
                  <tr key={`${row.address}-${row.zip}-${row.reasonCode}-${row.rejectedAt.toISOString()}`}>
                    <td>
                      {row.address}
                      <div className="hint">
                        {row.city}, {row.state} {row.zip}
                      </div>
                    </td>
                    <td>{REASON_LABEL[row.reasonCode]}</td>
                    <td>{row.reasonText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 8 ? <p className="hint">And {rows.length - 8} more.</p> : null}
          </div>
        ) : null}
        <Button
          type="button"
          disabled={busy || rows.length === 0 || issues.length > 0}
          onClick={() => {
            setBusy(true);
            setError("");
            void importRejections(rows)
              .then(() => {
                setMessage(`Imported ${rows.length} rows.`);
                setRows([]);
              })
              .catch((err: unknown) => setError(explain(err)))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Importing" : "Import"}
        </Button>
      </div>
    </>
  );
}
