import { useState } from "react";
import type { PaginatedSessions, StatusResponse } from "../../api-types";
import { formatTokenCount } from "../format";
import { HoverArrows, HoverCtl } from "./HoverArrows";
import { sessionSort, sortSessions, type SessionSort } from "./usageView";

const PER_PAGE = 3;
const SORTS: SessionSort[] = ["recent", "tokens"];

/** Active session count + recent sessions. Hover arrows page through the
 *  loaded list, 3 at a time; a switch in the same control sorts the whole
 *  loaded list by token use before paging. */
export function SessionsWidget({
  status, sessions, widgetProps, onWidgetPropsChange,
}: {
  status: StatusResponse | null;
  sessions: PaginatedSessions | null;
  widgetProps: Record<string, unknown>;
  onWidgetPropsChange: (next: Record<string, unknown>) => void;
}) {
  const [page, setPage] = useState(0);
  if (!status && !sessions) return <span className="dim">loading…</span>;
  const sort: SessionSort = sessionSort(widgetProps.sort);
  const setProp = (patch: Record<string, unknown>) =>
    onWidgetPropsChange({ ...widgetProps, ...patch });
  const all = sortSessions(sessions?.sessions ?? [], sort);
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const p = Math.min(page, pages - 1);
  const slice = all.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE);
  const sortCtl = SORTS.map((s) => (
    <button
      key={s}
      className={`hv-opt${sort === s ? " on" : ""}`}
      onClick={() => setProp({ sort: s })}
      title={s === "recent" ? "backend order (recent)" : "most tokens first"}
    >
      {s}
    </button>
  ));
  return (
    <div>
      {pages > 1 ? (
        <HoverArrows
          onPrev={() => setPage(Math.max(0, p - 1))}
          onNext={() => setPage(Math.min(pages - 1, p + 1))}
          label={`${p + 1}/${pages}`}
          prevDisabled={p <= 0}
          nextDisabled={p >= pages - 1}
        >
          <span className="tok-div" />
          {sortCtl}
        </HoverArrows>
      ) : (
        <HoverCtl className="hover-arrows">{sortCtl}</HoverCtl>
      )}
      <span className="bigval">{status?.active_sessions ?? "—"}</span>
      <span className="dim"> active</span>
      <div className="rows">
        {slice.map((s) => (
          <div className="row" key={s.id}>
            <span className="dim row-name" title={s.title ?? s.source ?? s.id}>
              {s.title ?? s.source ?? s.id}
            </span>
            <span className="dim num">{formatTokenCount(s.input_tokens + s.output_tokens)}</span>
            <span className={s.is_active ? "ok" : "dim"}>
              {s.is_active ? "live" : "idle"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
