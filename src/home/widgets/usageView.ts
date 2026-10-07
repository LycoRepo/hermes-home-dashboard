// Pure grouping/sorting helpers for the Tokens and Sessions widgets, kept
// React-free for unit testing (same rationale as tokenSeries.ts).
import type { ModelsAnalyticsEntry, SessionInfo } from "../../api-types";

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

export interface GroupBucket {
  key: string;
  label: string;
  tokens: number;
  cost: number;
}

/** Fold the (model, provider) rows of one range into display buckets:
 *  `tokens = input + output` (the day view's unit — cache_read/reasoning are
 *  excluded so the two views stay comparable), `cost = estimated_cost`.
 *  Sorted by tokens descending, ties broken by code-unit label order so the
 *  sequence never depends on the machine's locale. */
export function groupBuckets(
  rows: ModelsAnalyticsEntry[],
  mode: "model" | "provider",
): GroupBucket[] {
  const buckets = new Map<string, GroupBucket>();
  for (const row of rows) {
    const label = mode === "provider"
      ? providerLabel(row.provider)
      : (normalize(row.model) ? String(row.model).trim() : UNLABELED);
    // Keyed by the normalized label, so the four Alibaba spellings collapse.
    const key = normalize(label);
    const cur = buckets.get(key) ?? { key, label, tokens: 0, cost: 0 };
    cur.tokens += (row.input_tokens ?? 0) + (row.output_tokens ?? 0);
    cur.cost += row.estimated_cost ?? 0;
    buckets.set(key, cur);
  }
  return [...buckets.values()].sort(
    (a, b) => b.tokens - a.tokens || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
  );
}

/** Grouped views list at most this many buckets; the rest fold into "+N more".
 *  Lives here (not in the widget) so the threshold is unit-testable. */
export const MAX_BUCKETS = 6;

/** The first `max` buckets plus how many were left out. Kept pure so the
 *  "+N more" threshold — which the widget renders inline — can be tested.
 *  `buckets.length <= max` returns the *same array* (no copy, `hidden` 0);
 *  `max` is clamped to a non-negative integer so a bad value can't over-slice. */
export function topBuckets(
  buckets: GroupBucket[],
  max: number,
): { top: GroupBucket[]; hidden: number } {
  const limit = Math.max(0, Math.trunc(max));
  if (buckets.length <= limit) return { top: buckets, hidden: 0 };
  return { top: buckets.slice(0, limit), hidden: buckets.length - limit };
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
