// Pure grouping/sorting helpers for the Tokens and Sessions widgets, kept
// React-free for unit testing (same rationale as tokenSeries.ts).
import type { SessionInfo, TokenSeriesRow } from "../../api-types";

export type GroupMode = "day" | "model" | "provider";

/** Anything unknown (missing key, hand-edited layout, future value) falls back
 *  to "day", which is the unchanged legacy view. */
export function groupMode(raw: unknown): GroupMode {
  return raw === "model" || raw === "provider" ? raw : "day";
}

/** Only the grouped views need the models source; the day view keeps fetching
 *  /analytics exactly as before. Guards the second effect in TokensWidget. */
export function needsModels(mode: GroupMode): boolean {
  return mode !== "day";
}

/** Unset provider/model shows under this label rather than a blank row. */
const UNLABELED = "未标注";

// Exact spellings observed in this Hermes' state.db (7d and 30d windows both
// contain all of them). Alibaba publishes under four billing_provider values
// for the same endpoint (dashscope.aliyuncs.com/compatible-mode/v1); showing
// them as four vendors is the bug this table fixes.
//   alibaba-cn | alibaba | bailian-others | dashscope-others  -> "Alibaba"
//   ""        | null | undefined                              -> "未标注"
//   mira / custom / deepseek / xiaomi / kimi-coding-cn        -> unchanged
// Deliberately exact keys only — no prefix/substring fallback: the spellings
// above are the only ones that ever appear, so a broader match would be dead
// code that silently swallows a future legitimate vendor.
const PROVIDER_ALIASES: Record<string, string> = {
  "alibaba-cn": "Alibaba",
  alibaba: "Alibaba",
  "bailian-others": "Alibaba",
  "dashscope-others": "Alibaba",
};

function normalize(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Display label for a billing_provider value. */
export function providerLabel(raw: string | null | undefined): string {
  const key = normalize(raw);
  if (!key) return UNLABELED;
  return PROVIDER_ALIASES[key] ?? (raw ?? "").trim();
}

/** The minimal shape the grouped views rank: a stable key, a display label and
 *  the window total. `topBuckets` and the series folds are generic over it, so
 *  the ranking threshold stays unit-testable without a concrete container. */
export interface RankedBucket {
  key: string;
  label: string;
  tokens: number;
}

/** Grouped views keep at most this many real series; the rest fold into 其他.
 *  Lives here (not in the widget) so the threshold is unit-testable. */
export const MAX_BUCKETS = 6;

/** The first `max` buckets plus how many were left out — the tail is folded
 *  into 其他 by `takeTopSeries`, never dropped. Kept pure so the threshold can
 *  be tested. `buckets.length <= max` returns the *same array* (no copy,
 *  `hidden` 0); `max` is clamped to a non-negative integer so a bad value can't
 *  over-slice. */
export function topBuckets<T extends RankedBucket>(
  buckets: T[],
  max: number,
): { top: T[]; hidden: number } {
  const limit = Math.max(0, Math.trunc(max));
  if (buckets.length <= limit) return { top: buckets, hidden: 0 };
  return { top: buckets.slice(0, limit), hidden: buckets.length - limit };
}

// ── grouped charts (model / provider) ───────────────────────────────────
//
// The grouped views draw one series per model/provider across the range's day
// slots. Everything below is pure: the widget only renders it.

/** One series of the grouped charts: its value per axis slot (`values[i]`
 *  belongs to `seriesSlots(daySlots, byMonth)[i]`) plus the window total the
 *  ranking and the big numbers use. */
export interface TokenSeriesPoint extends RankedBucket {
  values: number[];
  /** True only for the synthesized "其他" tail — never for a real series. */
  isOther: boolean;
}

/** Parse a "YYYY-MM-DD" day as a LOCAL calendar date. `new Date("2026-06-01")`
 *  parses as UTC midnight, which the month read below would shift back a day in
 *  negative offsets. Kept in sync with `tokenSeries.parseDay` — same rule, same
 *  reason (this file may not import it: the module is React-free but the
 *  dependency direction is widget → helpers, not helper → helper). */
function parseDay(day: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(day);
}

/** Month bucket key of a day. MUST stay identical to `tokenSeries.toBars`'
 *  month key (`${year}-${monthIndex}`, zero-based month, local date) so the
 *  grouped 6-month axis and the day view's months line up. */
export function monthKeyOf(day: string): string {
  const date = parseDay(day);
  return isNaN(date.getTime())
    ? day.slice(0, 7)
    : `${date.getFullYear()}-${date.getMonth()}`;
}

/** The grouped chart's axis: the payload's day slots themselves, or — for the
 *  6-month range — their months, the same granularity the day view collapses
 *  to. Consecutive by construction (the server enumerates every day of the
 *  window), so no empty month can appear in the middle. */
export function seriesSlots(daySlots: string[], byMonth: boolean): string[] {
  if (!byMonth) return daySlots;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const day of daySlots) {
    const key = monthKeyOf(day);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/** Hover label for an axis slot ("Oct 2", or "Oct" for a month bucket). */
export function slotLabel(slot: string, byMonth: boolean): string {
  if (byMonth) {
    const m = /^(\d{4})-(\d{1,2})$/.exec(slot);
    return m
      ? new Date(Number(m[1]), Number(m[2]), 1).toLocaleDateString(undefined, { month: "short" })
      : slot;
  }
  const date = parseDay(slot);
  return isNaN(date.getTime())
    ? slot
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Fold the series route's (day, model|provider) rows into one zero-filled
 *  value vector per series.
 *
 *  `tokens` is the window total and `Σ values === tokens` by construction.
 *  Rows on a day outside the axis are dropped (the route already filters them,
 *  this keeps the fold total). Series are ranked by tokens descending with a
 *  code-unit label tie-break — never by arrival order — so the colour mapping
 *  below is stable across reloads. */
export function foldTokenSeries(
  rows: TokenSeriesRow[],
  mode: "model" | "provider",
  daySlots: string[],
  byMonth = false,
): TokenSeriesPoint[] {
  const slots = seriesSlots(daySlots, byMonth);
  const axis = new Map(slots.map((slot, i) => [slot, i]));
  const series = new Map<string, TokenSeriesPoint>();
  for (const row of rows) {
    const label = mode === "provider"
      ? providerLabel(row.provider)
      : (normalize(row.model) ? String(row.model).trim() : UNLABELED);
    // Keyed by the normalized label, so the four Alibaba spellings collapse.
    const key = normalize(label);
    const i = axis.get(byMonth ? monthKeyOf(row.day) : row.day);
    if (i === undefined) continue;
    const cur = series.get(key)
      ?? { key, label, tokens: 0, values: slots.map(() => 0), isOther: false };
    const value = row.tokens ?? 0;
    cur.tokens += value;
    cur.values[i] += value;
    series.set(key, cur);
  }
  return [...series.values()].sort(
    (a, b) => b.tokens - a.tokens || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
  );
}

/** Key/label of the synthesized tail bucket: rank `MAX_BUCKETS + 1` and below. */
export const OTHER_KEY = "__other__";
export const OTHER_LABEL = "其他";

/** The top `max` series with the rest folded into one `其他` series, whose
 *  values are the tail's per-slot sums — no usage is ever dropped from the
 *  chart, only aggregated. `max` is clamped like `topBuckets`. */
export function takeTopSeries(
  series: TokenSeriesPoint[],
  max: number = MAX_BUCKETS,
): TokenSeriesPoint[] {
  const { top, hidden } = topBuckets(series, max);
  if (!hidden) return top;
  const rest = series.slice(top.length);
  const width = top[0]?.values.length ?? rest[0]?.values.length ?? 0;
  return [
    ...top,
    {
      key: OTHER_KEY,
      label: OTHER_LABEL,
      tokens: rest.reduce((sum, s) => sum + s.tokens, 0),
      values: Array.from({ length: width }, (_, i) =>
        rest.reduce((sum, s) => sum + (s.values[i] ?? 0), 0)),
      isOther: true,
    },
  ];
}

/** Height of a stacked column, in % of the chart band.
 *
 *  Uses the day view's own formula (`max(8, tokens / peak * 100)`, see
 *  `TokensWidget`), so a day with usage draws exactly as tall as the day view
 *  draws it; the 100% cap only guards a degenerate peak (the widget passes the
 *  tallest column, so real input never reaches it). A day whose total is 0
 *  draws nothing: the column keeps its slot on the axis (its width is
 *  reserved) but has no visible segment — the day view's 8% stub belongs to the
 *  day view and is untouched. */
export function stackColumnPct(total: number, peak: number): number {
  if (!(total > 0)) return 0;
  return Math.min(100, Math.max(8, (total / Math.max(1, peak)) * 100));
}

/** Per-series segment heights as % of the same band; they sum to the column
 *  height because the caller passes `total` = Σ values. Zero series are 0
 *  (the renderer skips them), which is what keeps two adjacent colours from
 *  meeting across an empty gap. */
export function stackSegmentPcts(values: number[], columnPct: number, total: number): number[] {
  if (!(total > 0) || columnPct <= 0) return values.map(() => 0);
  return values.map((value) => (value > 0 ? (value / total) * columnPct : 0));
}

/** Per-series polyline in the 100×100 viewBox the day view uses: x spread
 *  across the axis, y measured up from the baseline at `H - PAD`. A single
 *  point is centred (there is no slope to draw), an empty series gives []. */
export function lineCoords(
  values: number[],
  peak: number,
  W = 100,
  H = 100,
  PAD = 3,
): [number, number][] {
  const n = values.length;
  const max = Math.max(1, peak);
  return values.map((value, i) => [
    n <= 1 ? W / 2 : (i / (n - 1)) * W,
    H - PAD - (value / max) * (H - PAD * 2),
  ]);
}

/** SVG path through pre-computed coords (the day view's path shape). */
export function linePathOf(coords: [number, number][]): string {
  return coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

/** Fixed blue ramp for the grouped charts (the user asked for the blue family).
 *
 *  Fixed hex rather than a derivation from `--home-accent`: the theme's primary
 *  is gold by default, so a derived ramp would break the "blue" instruction and
 *  make the separation guarantees below untestable. Same hue, one saturation;
 *  the separation rides on lightness only (H 214°, S 62%, L 34→82, step 8). */
export const SERIES_COLORS = [
  "#21508C", "#2962AE", "#3075CF", "#528BD6", "#73A1DE", "#94B7E6", "#B5CDED",
] as const;

/** The tail bucket is neutral grey on purpose: it is "misc", not a real model,
 *  and must not read as one more member of the ramp. */
export const OTHER_COLOR = "#7c8494";

/** Worst-case legend text colour: home.css paints the legend with
 *  `--color-foreground` and this is that variable's fallback (home.css:20). */
export const LEGEND_TEXT = "#d8dce6";

/** Rank → ramp step. Ranks are handed out in this order, so neighbouring
 *  series (stacked segments, adjacent lines) are never neighbouring colours:
 *  every adjacent pair is ≥ 2 steps apart (≈16 lightness points) and each step
 *  is used at most once. */
const COLOR_STEPS = [0, 2, 4, 6, 1, 3];

/** Ramp steps for `count` ranked series (≤ 6 real series; the tail is grey). */
export function assignColorSteps(count: number): number[] {
  return COLOR_STEPS.slice(0, Math.max(0, Math.min(Math.trunc(count), COLOR_STEPS.length)));
}

export type SessionSort = "recent" | "tokens";

/** Unknown values fall back to "recent" = the unchanged legacy order. */
export function sessionSort(raw: unknown): SessionSort {
  return raw === "tokens" ? "tokens" : "recent";
}

/** "recent" returns the list untouched (the backend's order *is* the legacy
 *  behaviour, so reordering it would be a regression). "tokens" sorts by
 *  input+output descending using a stable sort with no second key: ties keep
 *  the backend order, which for 0-token sessions means "still recent first". */
export function sortSessions<S extends Pick<SessionInfo, "input_tokens" | "output_tokens">>(
  list: S[],
  mode: SessionSort,
): S[] {
  if (mode !== "tokens") return list;
  const io = (s: S) => (s.input_tokens ?? 0) + (s.output_tokens ?? 0);
  return [...list].sort((a, b) => io(b) - io(a));
}
