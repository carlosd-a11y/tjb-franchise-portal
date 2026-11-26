import { REASON_LABEL } from "../lib/model";
import type { RejectionHit } from "../types";

export function RejectionWarning({ hits }: { hits: RejectionHit[] }) {
  if (hits.length === 0) return null;
  return (
    <div className="banner banner-warn" role="status">
      <strong>Rejected before.</strong>
      <ul>
        {hits.map((hit) => (
          <li key={hit.id}>
            {hit.match === "address" ? "Same address" : `ZIP ${hit.zip}`} · {REASON_LABEL[hit.reasonCode]}
            . {hit.reasonText}
          </li>
        ))}
      </ul>
    </div>
  );
}
