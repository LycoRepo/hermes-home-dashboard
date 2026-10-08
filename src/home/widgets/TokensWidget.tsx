import { useEffect, useMemo, useRef, useState } from "react";
import { api, getAnalyticsSeries } from "../../sdk";
import type { AnalyticsResponse, TokenSeriesResponse } from "../../api-types";
import { formatTokenCount } from "../format";
import { HoverCtl } from "./HoverArrows";
import { toBars, type Bar } from "./tokenSeries";
import {
  assignColorSteps, foldTokenSeries, groupMode, lineCoords, linePathOf, MAX_BUCKETS,
  needsModels, OTHER_COLOR, SERIES_COLORS, seriesSlots, slotLabel, stackColumnPct,
  stackSegmentPcts, takeTopSeries, type GroupMode,
} from "./usageView";

/** One payload serves a range and both groupings, so a re-read within this
 *  window is free. */
const SERIES_CACHE_MS = 60_000;
const GROUPS = ["day", "model", "provider"] as const;

// Line geometry lives in a 100×100 viewBox (stretched to fit, non-scaling stroke).
const H = 100, W = 100, PAD = 3;

const RANGES = [
  { key: "week", label: "7 days", days: 7, byMonth: false },
  { key: "month", label: "1 month", days: 30, byMonth: false },
  { key: "halfyear", label: "6 months", days: 180, byMonth: true },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

// Per-instance gradient id, so two tokens widgets never share a <defs> id (the
// shim'd React build has no useId, so this stays self-contained).
let gradSeq = 0;

interface Props {
  /** Shared 1-day analytics from the poll — used only as a failed-fetch fallback. */
  analytics: AnalyticsResponse | null;
  widgetProps: Record<string, unknown>;
  onWidgetPropsChange: (next: Record<string, unknown>) => void;
}

interface SeriesView {
  days: number;
  data: TokenSeriesResponse | null;
  /** True when the range's data is the last known good one, not a fresh read. */
  stale: boolean;
  failed: boolean;
}

/** Token usage with a hover range selector (7 days / 1 month / 6 months), a
 *  bars↔line chart toggle and a totals show/hide toggle, all in one line.
 *  Each range fetches once on demand; hovering a point reveals an animated
 *  tooltip with that day's (or month's) tokens. The same line groups the range
 *  by model or by provider, which draws stacked bars / one line per series
 *  with a legend.
 *
 *  Both views share one ruler: the grouped series count only the primary usage
 *  (the plugin route's `task = ''` filter), so the day's columns add up to that
 *  day's bar in the day view, and the big number plus the in/out/cost line come
 *  from the very same `/analytics` totals. No amounts anywhere inside the
 *  grouped view itself. */
export function TokensWidget({ analytics, widgetProps, onWidgetPropsChange }: Props) {
  const rangeKey: RangeKey =
    RANGES.find((r) => r.key === widgetProps.range)?.key ?? "week";
  const range = RANGES.find((r) => r.key === rangeKey)!;
  const idx = RANGES.findIndex((r) => r.key === rangeKey);
  const chart: "bars" | "line" = widgetProps.chart === "bars" ? "bars" : "line";
  const statsOn = widgetProps.stats !== false; // totals visible unless turned off
  const group: GroupMode = groupMode(widgetProps.group);
  const [gid] = useState(() => `tok-grad-${gradSeq++}`);

  const [fetched, setFetched] = useState<AnalyticsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  // Hover tooltip. `tip` stays set through the fade-out (so disappearing is also
  // animated); `show` toggles the appear/disappear animation. `pt` is the line
  // point in viewBox units, used to draw the marker dot in line mode.
  const [tip, setTip] = useState<{ bar: Bar; frac: number; pt?: [number, number] } | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFetched(null); setFailed(false);
    api.getAnalytics(range.days)
      .then((r) => { if (!cancelled) setFetched(r); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [range.days]);

  // Grouped views (model / provider) fetch the plugin's series route on demand
  // — in a separate effect so the day path above stays exactly as it was, and
  // day mode never issues a series request.
  const cacheRef = useRef(new Map<number, { data: TokenSeriesResponse; at: number }>());
  const [series, setSeries] = useState<SeriesView | null>(null);
  // Series hover: legend entries highlight their line/segment while the rest
  // fade back. Reset on leave so a stale key never dims the next render.
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [gtip, setGTip] = useState<{ label: string; tokens: number; frac: number } | null>(null);

  useEffect(() => {
    if (!needsModels(group)) return;
    // The guard above narrows the runtime path; name the narrowed mode for TS.
    const mode: "model" | "provider" = group === "provider" ? "provider" : "model";
    let cancelled = false;
    const cached = cacheRef.current.get(range.days);
    if (cached && Date.now() - cached.at < SERIES_CACHE_MS) {
      setSeries({ days: range.days, data: cached.data, stale: false, failed: false });
      return;
    }
    getAnalyticsSeries(range.days, mode)
      .then((r) => {
        if (cancelled) return;
        cacheRef.current.set(range.days, { data: r, at: Date.now() });
        setSeries({ days: range.days, data: r, stale: false, failed: false });
      })
      .catch(() => {
        if (cancelled) return;
        // A failed refresh keeps the last payload we saw (marked stale).
        setSeries((prev) => {
          const data = (prev && prev.days === range.days ? prev.data : null)
            ?? cacheRef.current.get(range.days)?.data ?? null;
          return { days: range.days, data, stale: data !== null, failed: true };
        });
      });
    return () => { cancelled = true; };
  }, [group, range.days]);

  const setProp = (patch: Record<string, unknown>) =>
    onWidgetPropsChange({ ...widgetProps, ...patch });
  const cycle = (dir: 1 | -1) =>
    setProp({ range: RANGES[(idx + dir + RANGES.length) % RANGES.length].key });

  const controls = (
    <HoverCtl className="tok-ctl tok-set">
      <div className="tok-line">
        <button className="hv-arrow" aria-label="previous" onClick={() => cycle(-1)}>‹</button>
        <span className="hv-label">{range.label}</span>
        <button className="hv-arrow" aria-label="next" onClick={() => cycle(1)}>›</button>
        <span className="tok-div" />
        <button
          className={`hv-opt${chart === "line" ? " on" : ""}`}
          onClick={() => setProp({ chart: chart === "line" ? "bars" : "line" })}
          title="line / bars view"
        >
          line
        </button>
        <button
          className={`hv-opt${statsOn ? " on" : ""}`}
          onClick={() => setProp({ stats: !statsOn })}
          title="show / hide totals"
        >
          totals
        </button>
        <span className="tok-div" />
        {GROUPS.map((g) => (
          <button
            key={g}
            className={`hv-opt${group === g ? " on" : ""}`}
            onClick={() => setProp({ group: g })}
            title={g === "day" ? "per-day chart" : `group this range by ${g}`}
          >
            {g}
          </button>
        ))}
      </div>
    </HoverCtl>
  );

  // On-demand fetch, or a failed-fetch fallback to the shared day poll.
  const view = fetched ?? (failed ? analytics : null);
  const bars = useMemo(
    () => toBars(view?.daily ?? [], range.byMonth),
    [view, range.byMonth],
  );

  // Grouped view: one series per model / provider across the range's day
  // slots, drawn as stacked bars or as one line per series, with a legend.
  const grouped = group === "day" ? null : group;
  if (grouped) {
    const sv = series && series.days === range.days ? series : null;
    const data = sv?.data ?? null;
    if (!data) {
      return (
        <div>
          {controls}
          <span className="dim">{sv?.failed ? "unavailable" : "loading…"}</span>
        </div>
      );
    }
    const points = takeTopSeries(
      foldTokenSeries(data.rows, grouped, data.days, range.byMonth),
      MAX_BUCKETS,
    );
    if (!points.length) {
      return (
        <div>
          {controls}
          <span className="dim">no usage in this range</span>
        </div>
      );
    }
    const slots = seriesSlots(data.days, range.byMonth);
    const steps = assignColorSteps(points.length);
    const colors = points.map((p, i) => (p.isOther ? OTHER_COLOR : SERIES_COLORS[steps[i]]));
    const columnTotals = slots.map((_, i) =>
      points.reduce((sum, p) => sum + (p.values[i] ?? 0), 0));
    // Same ruler as the day view (peak = the biggest day's total), so a day
    // with usage is exactly as tall in both views.
    const peak = Math.max(1, ...columnTotals);
    const dimmed = (key: string) => (hoverKey && hoverKey !== key ? 0.22 : 1);
    const hover = (slot: string, i: number, tokens: number) => {
      setGTip({ label: slotLabel(slot, range.byMonth), tokens, frac: (i + 0.5) / slots.length });
      setShow(true);
    };
    const leave = () => { setGTip(null); setShow(false); };
    // One source for the numbers, exactly as in the day view: the range's
    // /analytics totals. The grouped breakdown never becomes a second ruler.
    const t = view?.totals ?? null;
    return (
      <div>
        {controls}
        {t ? (
          <span className="bigval">{formatTokenCount(t.total_input + t.total_output)}</span>
        ) : (
          <span className="dim">loading…</span>
        )}
        <span className="dim"> by {group} · {range.label}{sv?.stale ? " · stale" : ""}</span>
        <div className="home-spark-wrap" onMouseLeave={leave}>
          {gtip && (
            <div
              className={`home-spark-tip${show ? " show" : ""}`}
              style={{ left: `${gtip.frac * 100}%`, transform: `translateX(${-gtip.frac * 100}%)` }}
            >
              <b>{gtip.label}</b> · {formatTokenCount(gtip.tokens)}
            </div>
          )}
          {chart === "line" ? (
            <svg className="home-area" viewBox="0 0 100 100" preserveAspectRatio="none">
              {points.map((p, i) => (
                <path
                  key={p.key}
                  d={linePathOf(lineCoords(p.values, peak, W, H, PAD))}
                  fill="none"
                  stroke={colors[i]}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  // "其他" is an aggregate, not a series: dashed marks it as such.
                  strokeDasharray={p.isOther ? "4 3" : undefined}
                  opacity={dimmed(p.key)}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {slots.map((slot, i) => (
                <rect
                  key={slot}
                  x={(i * W) / slots.length} y={0} width={W / slots.length} height={H} fill="transparent"
                  onMouseEnter={() => hover(slot, i, columnTotals[i])}
                  onMouseLeave={leave}
                />
              ))}
            </svg>
          ) : (
            <div className="tok-stack">
              {slots.map((slot, i) => {
                const total = columnTotals[i];
                const columnPct = stackColumnPct(total, peak);
                const segs = stackSegmentPcts(
                  points.map((p) => p.values[i] ?? 0), columnPct, total,
                );
                return (
                  <div
                    className="tok-col"
                    key={slot}
                    onMouseEnter={() => hover(slot, i, total)}
                    onMouseLeave={leave}
                  >
                    {points.map((p, si) =>
                      segs[si] > 0 ? (
                        <i
                          key={p.key}
                          className="tok-seg"
                          style={{ height: `${segs[si]}%`, background: colors[si], opacity: dimmed(p.key) }}
                        />
                      ) : null,
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {/* Legend: colour + name, full name on hover, and hovering an entry
         *  highlights that series in the chart (the rest fades back). */}
        <div className="tok-legend" onMouseLeave={() => setHoverKey(null)}>
          {points.map((p, i) => (
            <span
              key={p.key}
              className={`tok-legend-item${hoverKey && hoverKey !== p.key ? " dim" : ""}`}
              title={p.label}
              onMouseEnter={() => setHoverKey(p.key)}
            >
              <i className="tok-swatch" style={{ background: colors[i] }} />
              <span className="tok-legend-name">{p.label}</span>
            </span>
          ))}
        </div>
        {statsOn && t && (
          <div className="tok-stats">
            <span><span className="dim">in</span> {formatTokenCount(t.total_input)}</span>
            <span><span className="dim">out</span> {formatTokenCount(t.total_output)}</span>
            <span><span className="dim">cost</span> <span className="ok">${t.total_estimated_cost.toFixed(2)}</span></span>
          </div>
        )}
      </div>
    );
  }

  if (!view) {
    return (
      <div>
        {controls}
        <span className="dim">{failed ? "unavailable" : "loading…"}</span>
      </div>
    );
  }

  const t = view.totals;
  const total = t.total_input + t.total_output;
  const n = bars.length;
  const max = Math.max(1, ...bars.map((b) => b.tokens));

  // Line/area geometry in the shared 100×100 viewBox.
  const coords: [number, number][] = bars.map((b, i) => [
    n <= 1 ? W / 2 : (i / (n - 1)) * W,
    H - PAD - (b.tokens / max) * (H - PAD * 2),
  ]);
  const linePath = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const areaPath = n ? `${linePath} L${coords[n - 1][0].toFixed(2)},${H} L${coords[0][0].toFixed(2)},${H} Z` : "";

  return (
    <div>
      {controls}
      <span className="bigval">{formatTokenCount(total)}</span>
      <span className="dim"> {range.label}{failed ? " · day*" : ""}</span>
      <div className="home-spark-wrap" onMouseLeave={() => setShow(false)}>
        {tip && (
          <div
            className={`home-spark-tip${show ? " show" : ""}`}
            style={{ left: `${tip.frac * 100}%`, transform: `translateX(${-tip.frac * 100}%)` }}
          >
            <b>{tip.bar.label}</b> · {formatTokenCount(tip.bar.tokens)} · ${tip.bar.cost.toFixed(2)}
          </div>
        )}
        {chart === "line" ? (
          <svg className="home-area" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: "var(--home-accent)", stopOpacity: 0.5 }} />
                <stop offset="100%" style={{ stopColor: "var(--home-accent)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            {areaPath && <path d={areaPath} fill={`url(#${gid})`} />}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="var(--home-accent)"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {show && tip?.pt && (
              <circle cx={tip.pt[0]} cy={tip.pt[1]} r={2.4} fill="var(--home-accent)" vectorEffect="non-scaling-stroke" />
            )}
            {bars.map((b, i) => (
              <rect
                key={b.key}
                x={(i * W) / n} y={0} width={W / n} height={H} fill="transparent"
                onMouseEnter={() => { setTip({ bar: b, frac: n <= 1 ? 0.5 : i / (n - 1), pt: coords[i] }); setShow(true); }}
              />
            ))}
          </svg>
        ) : (
          <div className="home-spark">
            {bars.map((b, i) => (
              <i
                key={b.key}
                onMouseEnter={() => { setTip({ bar: b, frac: (i + 0.5) / n }); setShow(true); }}
                style={{ height: `${Math.max(8, (b.tokens / max) * 100)}%` }}
              />
            ))}
          </div>
        )}
      </div>
      {statsOn && (
        <div className="tok-stats">
          <span><span className="dim">in</span> {formatTokenCount(t.total_input)}</span>
          <span><span className="dim">out</span> {formatTokenCount(t.total_output)}</span>
          <span><span className="dim">cost</span> <span className="ok">${t.total_estimated_cost.toFixed(2)}</span></span>
        </div>
      )}
    </div>
  );
}
