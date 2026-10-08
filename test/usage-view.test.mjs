import assert from "node:assert/strict";
import test from "node:test";

import {
  groupMode, needsModels, providerLabel, topBuckets, MAX_BUCKETS,
  sessionSort, sortSessions,
  assignColorSteps, foldTokenSeries, takeTopSeries, seriesSlots, monthKeyOf, slotLabel,
  stackColumnPct, stackSegmentPcts, lineCoords, linePathOf,
  SERIES_COLORS, OTHER_COLOR, OTHER_KEY, LEGEND_TEXT,
} from "../src/home/widgets/usageView.ts";

// Helper: one row of the series route (only the fields the fold reads).
const srow = (day, model, provider, tokens) => ({ day, model, provider, tokens });
const DAYS = ["2026-10-01", "2026-10-02", "2026-10-03"];

// ── provider merge table ─────────────────────────────────────────────

test("providerLabel merges the four Alibaba spellings", () => {
  for (const raw of ["alibaba-cn", "alibaba", "bailian-others", "dashscope-others"]) {
    assert.equal(providerLabel(raw), "Alibaba", raw);
  }
});

test("providerLabel keeps mira and custom as their own labels", () => {
  assert.equal(providerLabel("mira"), "mira");
  assert.equal(providerLabel("custom"), "custom");
});

test("providerLabel labels empty values", () => {
  for (const raw of ["", null, undefined, "  "]) {
    assert.equal(providerLabel(raw), "未标注", JSON.stringify(raw));
  }
});

test("providerLabel keeps unknown spellings visible (no prefix fallback)", () => {
  assert.equal(providerLabel("bailian"), "bailian");
  assert.equal(providerLabel("dashscope-cn"), "dashscope-cn");
});

// ── top-N threshold ──────────────────────────────────────────────────

const bucket = (label, tokens) => ({ key: label, label, tokens, cost: 0 });

test("topBuckets returns every bucket when the count is at or under the max", () => {
  const buckets = [bucket("a", 30), bucket("b", 20), bucket("c", 10)];
  const { top, hidden } = topBuckets(buckets, MAX_BUCKETS);
  assert.equal(top, buckets); // same reference — no copy, no reordering
  assert.equal(hidden, 0);
  const six = Array.from({ length: 6 }, (_, i) => bucket(`m${i}`, 100 - i));
  assert.equal(topBuckets(six, MAX_BUCKETS).top.length, 6);
  assert.equal(topBuckets(six, MAX_BUCKETS).hidden, 0);
});

test("topBuckets slices at the max and reports the remainder as hidden", () => {
  const seven = Array.from({ length: 7 }, (_, i) => bucket(`m${i}`, 700 - i * 100));
  const { top, hidden } = topBuckets(seven, MAX_BUCKETS);
  assert.equal(top.length, MAX_BUCKETS);
  assert.equal(hidden, seven.length - MAX_BUCKETS);
  assert.deepEqual(top.map((b) => b.label), ["m0", "m1", "m2", "m3", "m4", "m5"]);
  assert.equal(hidden, 1);
  assert.equal(topBuckets(seven, 3).hidden, 4);
  // The source list is never mutated.
  assert.equal(seven.length, 7);
});

test("topBuckets with a max larger than the count does not over-slice", () => {
  const three = [bucket("a", 3), bucket("b", 2), bucket("c", 1)];
  const { top, hidden } = topBuckets(three, 12);
  assert.equal(top.length, 3);
  assert.equal(hidden, 0);
});

test("topBuckets on an empty list returns an empty top", () => {
  const { top, hidden } = topBuckets([], MAX_BUCKETS);
  assert.deepEqual(top, []);
  assert.equal(hidden, 0);
});

// ── mode guards ──────────────────────────────────────────────────────

test("groupMode defaults to day for anything unknown", () => {
  for (const raw of [undefined, null, "", "bogus", "day"]) {
    assert.equal(groupMode(raw), "day", JSON.stringify(raw));
  }
  assert.equal(groupMode("model"), "model");
  assert.equal(groupMode("provider"), "provider");
});

test("needsModels is false only for day", () => {
  assert.equal(needsModels("day"), false);
  assert.equal(needsModels("model"), true);
  assert.equal(needsModels("provider"), true);
});

// ── sessions sorting ─────────────────────────────────────────────────

const sess = (id, input, output) => ({ id, input_tokens: input, output_tokens: output });

test("sortSessions recent returns the input order untouched", () => {
  const list = [sess("d", 5, 5), sess("a", 900, 0), sess("c", 0, 0), sess("b", 1, 1), sess("e", 3, 3)];
  const out = sortSessions(list, "recent");
  assert.equal(out, list);
  assert.deepEqual(out.map((s) => s.id), ["d", "a", "c", "b", "e"]);
});

test("sortSessions tokens sorts descending and is stable for ties", () => {
  const list = [
    sess("zero-1", 0, 0),
    sess("big", 400, 100),
    sess("zero-2", 0, 0),
    sess("small", 10, 5),
    sess("zero-3", 0, 0),
  ];
  const out = sortSessions(list, "tokens");
  assert.deepEqual(out.map((s) => s.id), ["big", "small", "zero-1", "zero-2", "zero-3"]);
  assert.deepEqual(list.map((s) => s.id), ["zero-1", "big", "zero-2", "small", "zero-3"]);
});

test("sessionSort defaults to recent", () => {
  for (const raw of [undefined, null, "", "bogus", "recent"]) {
    assert.equal(sessionSort(raw), "recent", JSON.stringify(raw));
  }
  assert.equal(sessionSort("tokens"), "tokens");
});

// ── grouped series folding (model / provider charts) ─────────────────

test("foldTokenSeries merges the four Alibaba provider spellings per day", () => {
  const series = foldTokenSeries([
    srow("2026-10-01", "qwen3-flash", "alibaba-cn", 100),
    srow("2026-10-01", "qwen3-max", "alibaba", 25),
    srow("2026-10-02", "qwen3-flash", "bailian-others", 40),
    srow("2026-10-02", "qwen3-flash", "dashscope-others", 60),
    srow("2026-10-03", "glm-5", "mira", 7),
  ], "provider", DAYS);
  assert.deepEqual(series.map((s) => s.label), ["Alibaba", "mira"]);
  assert.deepEqual(series[0].values, [125, 100, 0]);
  assert.deepEqual(series[1].values, [0, 0, 7]);
  assert.equal(series[0].tokens, 225);
  assert.equal(series[0].tokens, series[0].values.reduce((a, b) => a + b, 0));
  assert.deepEqual(series.map((s) => s.isOther), [false, false]);
});

test("foldTokenSeries by model merges one model billed through two providers", () => {
  const series = foldTokenSeries([
    srow("2026-10-01", "qwen3-flash", "alibaba-cn", 600),
    srow("2026-10-02", "qwen3-flash", "custom", 400),
  ], "model", DAYS);
  assert.equal(series.length, 1);
  assert.equal(series[0].label, "qwen3-flash");
  assert.deepEqual(series[0].values, [600, 400, 0]);
});

test("foldTokenSeries labels an unset model 未标注 and ranks by tokens then label", () => {
  const series = foldTokenSeries([
    srow("2026-10-01", "", "mira", 5),
    srow("2026-10-01", "z", "mira", 1),
    srow("2026-10-01", "a", "mira", 1),
  ], "model", DAYS);
  // Code-unit tie-break: "a" before "z", never locale order.
  assert.deepEqual(series.map((s) => s.label), ["未标注", "a", "z"]);
});

test("takeTopSeries folds rank 7+ into 其他 without losing usage", () => {
  const rows = Array.from({ length: 9 }, (_, i) => srow("2026-10-01", `m${i}`, "p", 100 - i));
  const series = foldTokenSeries(rows, "model", DAYS);
  const top = takeTopSeries(series, 6);
  assert.equal(top.length, 7);
  assert.equal(top[6].key, OTHER_KEY);
  assert.equal(top[6].label, "其他");
  assert.equal(top[6].isOther, true);
  assert.deepEqual(top.slice(0, 6).map((s) => s.isOther), new Array(6).fill(false));
  assert.equal(top[6].tokens, (100 - 6) + (100 - 7) + (100 - 8));
  const windowSum = (list) => list.reduce((sum, s) => sum + s.tokens, 0);
  assert.equal(windowSum(top), windowSum(series));
  const columnSum = (list, i) => list.reduce((sum, s) => sum + s.values[i], 0);
  assert.deepEqual(
    DAYS.map((_, i) => columnSum(top, i)),
    DAYS.map((_, i) => columnSum(series, i)),
  );
});

test("takeTopSeries leaves six or fewer series untouched", () => {
  const series = foldTokenSeries(
    Array.from({ length: 6 }, (_, i) => srow("2026-10-01", `m${i}`, "p", 10)),
    "model", DAYS,
  );
  const top = takeTopSeries(series, 6);
  assert.equal(top, series); // same array — nothing to fold
  assert.ok(!top.some((s) => s.isOther));
  assert.equal(takeTopSeries(series, 12).length, 6);
});

test("foldTokenSeries zero-fills the axis, so a day without usage keeps its slot", () => {
  const series = foldTokenSeries([srow("2026-10-03", "m", "p", 5)], "model", DAYS);
  assert.equal(series[0].values.length, DAYS.length);
  assert.deepEqual(series[0].values, [0, 0, 5]);
  // A day outside the axis is dropped, never folded onto another day.
  assert.deepEqual(foldTokenSeries([srow("2026-09-30", "m", "p", 5)], "model", DAYS), []);
  // The 7-day window really spans 8 local days: the axis is the payload's day
  // set, not `days` slots (and not only the days that have usage).
  const eight = [
    "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
    "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08",
  ];
  assert.equal(foldTokenSeries([srow("2026-10-08", "m", "p", 1)], "model", eight)[0].values.length, 8);
});

// ── stacked-bar geometry (the day view's ruler) ──────────────────────

test("stackColumnPct keeps the day view's 8% floor and measures against the peak", () => {
  assert.equal(stackColumnPct(50, 100), 50);
  assert.equal(stackColumnPct(100, 100), 100);
  assert.equal(stackColumnPct(1, 100), 8); // Math.max(8, …), same as the day bars
  assert.equal(stackColumnPct(0, 100), 0); // no usage in the slot: nothing drawn
  assert.equal(stackColumnPct(5, 0), 100); // degenerate peak: capped, never 500%
  assert.equal(stackColumnPct(120, 100), 100); // capped at the band
});

test("stacked segments sum to their column height and keep the series order", () => {
  const values = [30, 45, 25];
  const total = values.reduce((a, b) => a + b, 0);
  const columnPct = stackColumnPct(total, 120);
  const segs = stackSegmentPcts(values, columnPct, total);
  assert.ok(Math.abs(segs.reduce((a, b) => a + b, 0) - columnPct) < 1e-9);
  assert.ok(Math.abs(columnPct - Math.max(8, (total / 120) * 100)) < 1e-9);
  assert.deepEqual(segs, [columnPct * 0.3, columnPct * 0.45, columnPct * 0.25]);
  // Rank order is preserved (the renderer stacks them bottom-up, so a zero
  // series contributes no segment and its neighbours must not merge into one).
  assert.deepEqual(stackSegmentPcts([10, 0, 30], 40, 40), [10, 0, 30]);
  assert.deepEqual(stackSegmentPcts([0, 0], 12, 0), [0, 0]);
});

// ── multi-series line geometry ───────────────────────────────────────

test("lineCoords spreads the axis and measures up from the baseline", () => {
  const H = 100, PAD = 3;
  const coords = lineCoords([0, 50, 100], 100);
  assert.deepEqual(coords.map(([x]) => x), [0, 50, 100]);
  assert.equal(coords[0][1], H - PAD);
  assert.equal(coords[2][1], PAD);
  assert.equal(coords[1][1], H - PAD - (50 / 100) * (H - PAD * 2));
  // One point has no slope to draw: centred. No points: nothing to draw.
  assert.equal(lineCoords([7], 10).length, 1);
  assert.equal(lineCoords([7], 10)[0][0], 50);
  assert.deepEqual(lineCoords([], 10), []);
  assert.equal(lineCoords([5], 0)[0][1], H - PAD - (5 / 1) * (H - PAD * 2));
});

test("linePathOf writes the day view's path shape", () => {
  assert.equal(linePathOf([]), "");
  assert.equal(linePathOf([[0, 97]]), "M0.00,97.00");
  assert.equal(linePathOf([[0, 97], [100, 3]]), "M0.00,97.00 L100.00,3.00");
});

// ── month axis (the 6-month range) ───────────────────────────────────

test("month folding sums a month's days under tokenSeries' month key", () => {
  const slots = ["2026-09-30", "2026-10-01", "2026-10-02", "2026-11-01"];
  assert.deepEqual(seriesSlots(slots, true), ["2026-8", "2026-9", "2026-10"]);
  assert.equal(seriesSlots(slots, false), slots);
  assert.equal(monthKeyOf("2026-09-30"), "2026-8"); // zero-based month, local
  const series = foldTokenSeries([
    srow("2026-09-30", "m", "p", 3),
    srow("2026-10-01", "m", "p", 4),
    srow("2026-10-02", "m", "p", 5),
    srow("2026-11-01", "m", "p", 6),
  ], "model", slots, true);
  assert.deepEqual(series[0].values, [3, 9, 6]);
  assert.equal(series[0].tokens, 18);
  assert.equal(series[0].tokens, series[0].values.reduce((a, b) => a + b, 0));
});

test("slotLabel names a day slot and a month slot", () => {
  assert.equal(
    slotLabel("2026-10-02", false),
    new Date(2026, 9, 2).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  );
  assert.equal(
    slotLabel("2026-9", true),
    new Date(2026, 9, 1).toLocaleDateString(undefined, { month: "short" }),
  );
});

// ── palette: a blue ramp that stays separable ────────────────────────
//
// The widget draws on the dark glass, so the readable end is itself a
// constraint; every threshold below is measured, not guessed.

const WIDGET_SURFACE = "#0c0c11";

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function hslOf(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l: l * 100 };
}

function relLum(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("the ramp has at least seven entries and no repeated colour", () => {
  assert.ok(SERIES_COLORS.length >= 7);
  assert.equal(new Set(SERIES_COLORS).size, SERIES_COLORS.length);
  assert.ok(!SERIES_COLORS.includes(OTHER_COLOR));
});

test("every ramp entry is blue and saturated enough to read as one family", () => {
  for (const hex of SERIES_COLORS) {
    const { h, s } = hslOf(hex);
    assert.ok(h >= 195 && h <= 245, `${hex} hue ${h.toFixed(1)}`);
    assert.ok(s >= 0.3, `${hex} saturation ${s.toFixed(3)}`);
  }
});

test("the ramp's lightness steps up with a visible gap between every pair", () => {
  for (let i = 1; i < SERIES_COLORS.length; i++) {
    const prev = hslOf(SERIES_COLORS[i - 1]).l;
    const cur = hslOf(SERIES_COLORS[i]).l;
    // 8 lightness points by construction; hex rounding leaves 7.8 as the
    // measured worst case, so that is the floor asserted here.
    assert.ok(cur > prev, `${SERIES_COLORS[i]}: not monotonic`);
    assert.ok(cur - prev >= 7.8, `${SERIES_COLORS[i - 1]} → ${SERIES_COLORS[i]}: ΔL ${(cur - prev).toFixed(2)}`);
  }
});

test("both ends of the ramp stay visible on the widget surface", () => {
  const darkest = SERIES_COLORS[0];
  const lightest = SERIES_COLORS[SERIES_COLORS.length - 1];
  assert.ok(contrast(darkest, WIDGET_SURFACE) >= 2, `darkest ${darkest}`);
  assert.ok(relLum(lightest) <= 0.85, `lightest ${lightest} must not wash out to white`);
});

test("其他 is neutral grey and sits outside the ramp", () => {
  assert.ok(hslOf(OTHER_COLOR).s <= 0.12, `saturation ${hslOf(OTHER_COLOR).s.toFixed(3)}`);
  assert.ok(!SERIES_COLORS.includes(OTHER_COLOR));
});

test("assignColorSteps hands out distinct steps that are never neighbours", () => {
  for (let count = 1; count <= 6; count++) {
    const steps = assignColorSteps(count);
    assert.equal(steps.length, count);
    assert.equal(new Set(steps).size, count);
    for (let i = 1; i < steps.length; i++) {
      assert.ok(Math.abs(steps[i] - steps[i - 1]) >= 2, `count ${count}: steps ${steps.join(",")}`);
    }
  }
  assert.deepEqual(assignColorSteps(0), []);
});

test("a series keeps its colour when the rows arrive in another order", () => {
  const rows = [
    srow("2026-10-01", "alpha", "p1", 10),
    srow("2026-10-01", "beta", "p2", 90),
    srow("2026-10-01", "gamma", "p3", 50),
    srow("2026-10-02", "alpha", "p1", 20),
  ];
  const colourMap = (list) => {
    const series = foldTokenSeries(list, "model", DAYS);
    const steps = assignColorSteps(series.length);
    return new Map(series.map((s, i) => [s.key, SERIES_COLORS[steps[i]]]));
  };
  const forward = colourMap(rows);
  const reversed = colourMap([...rows].reverse());
  assert.deepEqual([...forward], [...reversed]);
  assert.equal(new Set(forward.values()).size, forward.size);
});

test("legend text clears the contrast floor on the widget surface", () => {
  // home.css paints the legend with --color-foreground and LEGEND_TEXT is that
  // variable's fallback — i.e. the worst case the legend can be drawn in.
  assert.ok(
    contrast(LEGEND_TEXT, WIDGET_SURFACE) >= 4.5,
    `contrast ${contrast(LEGEND_TEXT, WIDGET_SURFACE).toFixed(2)}`,
  );
});
