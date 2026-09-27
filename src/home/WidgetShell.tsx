import type { CSSProperties, ReactNode } from "react";
import type { WidgetState } from "./widget-state";

const STATE_COPY: Partial<Record<WidgetState, string>> = {
  offline: "offline · Hermes backend unreachable",
  unavailable: "unavailable · this source is not responding",
};

interface Props {
  title: string;
  /** left/top/width/height in px, computed by GridCanvas. */
  style: CSSProperties;
  editing: boolean;
  dragging?: boolean;
  swapTarget?: boolean;
  /** Pointer is over the trash zone — dropping will delete this widget. */
  trashing?: boolean;
  /** Data-source health; offline/unavailable replace the body, stale keeps it. */
  state?: WidgetState;
  onRemove?: () => void;
  onHeaderPointerDown?: (e: React.PointerEvent) => void;
  onResizePointerDown?: (e: React.PointerEvent) => void;
  /** Rest-mode navigation (lock closed). */
  onClickThrough?: () => void;
  children: ReactNode;
}

export function WidgetShell({
  title, style, editing, dragging, swapTarget, trashing, state = "ok",
  onRemove, onHeaderPointerDown, onResizePointerDown, onClickThrough, children,
}: Props) {
  const cls = [
    "home-widget",
    dragging ? "dragging" : "",
    swapTarget ? "swap-target" : "",
    trashing ? "trashing" : "",
  ].filter(Boolean).join(" ");
  return (
    <div
      className={cls}
      style={style}
      onClick={!editing && onClickThrough ? onClickThrough : undefined}
      role={!editing && onClickThrough ? "link" : undefined}
    >
      <b className="hd" onPointerDown={editing ? onHeaderPointerDown : undefined}>
        {title}
        {state === "stale" && <span className="hd-stale" title="Last update failed — showing previous data"> · stale</span>}
      </b>
      {STATE_COPY[state] ? (
        <span className={`wstate wstate-${state}`}>{STATE_COPY[state]}</span>
      ) : children}
      {editing && onRemove && (
        <button className="wremove" onClick={onRemove} aria-label={`Remove ${title}`}>
          ×
        </button>
      )}
      {editing && <div className="rs" onPointerDown={onResizePointerDown} />}
    </div>
  );
}
