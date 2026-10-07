import assert from "node:assert/strict";
import test from "node:test";

import {
  groupMode, needsModels, providerLabel, groupBuckets, topBuckets, MAX_BUCKETS,
  sessionSort, sortSessions,
} from "../src/home/widgets/usageView.ts";

// Helper: a models-analytics row with only the fields the grouping reads.
const row = (model, provider, input, output, extra = {}) => ({
  model, provider,
  input_tokens: input, output_tokens: output,
  cache_read_tokens: 0, reasoning_tokens: 0,
  estimated_cost: 0, actual_cost: 0,
  sessions: 1, api_calls: 1, tool_calls: 0,
  last_used_at: null, avg_tokens_per_session: 0,
  ...extra,
});

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

// ── bucket folding ───────────────────────────────────────────────────

test("groupBuckets folds Alibaba into one row with the real 7d numbers", () => {
  const rows = [
    row("qwen3-flash", "alibaba-cn", 100000, 4636, { estimated_cost: 0.4 }),
    row("qwen3-flash", "alibaba", 20, 10, { estimated_cost: 0.1 }),
    row("qwen3-max", "bailian-others", 2000, 40, { estimated_cost: 0.2 }),
    row("qwen3-flash", "dashscope-others", 17000, 413, { estimated_cost: 0.3 }),
  ];
  const buckets = groupBuckets(rows, "provider");
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].label, "Alibaba");
  assert.equal(buckets[0].tokens, 124119);
  assert.equal(buckets[0].cost.toFixed(2), "1.00");
});

test("groupBuckets sorts by tokens descending", () => {
  const buckets = groupBuckets([
    row("a", "xiaomi", 474000, 535),
    row("b", "deepseek", 9500000, 8300000),
    row("c", "custom", 17000, 547),
    row("d", "kimi-coding-cn", 147000, 245),
    row("e", "", 1000, 217),
  ], "provider");
  assert.deepEqual(buckets.map((b) => b.label), [
    "deepseek", "xiaomi", "kimi-coding-cn", "custom", "未标注",
  ]);
  const tokens = buckets.map((b) => b.tokens);
  assert.deepEqual(tokens, [...tokens].sort((a, b) => b - a));
});

test("groupBuckets orders ties deterministically by code units", () => {
  const buckets = groupBuckets([
    row("x", "Zeta", 100, 0),
    row("y", "alpha", 100, 0),
    row("z", "Beta", 100, 0),
  ], "provider");
  // Code-unit order: uppercase sorts before lowercase (localeCompare would not).
  assert.deepEqual(buckets.map((b) => b.label), ["Beta", "Zeta", "alpha"]);
});

test("groupBuckets sums input and output and ignores cache/reasoning", () => {
  const buckets = groupBuckets(
    [row("m", "p", 100, 50, { cache_read_tokens: 9999, reasoning_tokens: 9999 })],
    "provider",
  );
  assert.equal(buckets[0].tokens, 150);
});

test("groupBuckets by model puts empty model under 未标注", () => {
  const buckets = groupBuckets([row("", "deepseek", 10, 10)], "model");
  assert.equal(buckets[0].label, "未标注");
  assert.equal(buckets.length, 1);
});

test("groupBuckets by model merges one model name across different providers", () => {
  // Same model billed through two providers (e.g. a direct account and a
  // gateway): model mode must fold them into a single bucket, not two rows.
  const rows = [
    row("qwen3-flash", "alibaba-cn", 60000, 4000, { estimated_cost: 0.25 }),
    row("qwen3-flash", "dashscope-others", 40000, 1000, { estimated_cost: 0.75 }),
  ];
  const buckets = groupBuckets(rows, "model");
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].label, "qwen3-flash");
  assert.equal(buckets[0].tokens, 105000);
  assert.equal(buckets[0].cost.toFixed(2), "1.00");
  // Provider mode keeps them apart only because the aliases differ; here both
  // spellings are Alibaba, so provider mode also gives one bucket.
  assert.equal(groupBuckets(rows, "provider").length, 1);
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
