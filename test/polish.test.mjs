import assert from "node:assert/strict";
import test from "node:test";

import { parseRecords } from "../src/home/widgets/logParse.ts";
import { matrixRows } from "../src/home/widgets/matrixGeometry.ts";
import { widgetState } from "../src/home/widget-state.ts";

// ── Logs: Windows hosts return CRLF lines ───────────────────────────────

test("parseRecords splits CRLF log lines into separate records", () => {
  const lines = [
    "2026-09-27 05:15:56,700 INFO [20260927_044915_a55169] agent.tool_executor: tool terminal completed (1.51s)\r\n",
    "2026-09-27 05:16:00,193 WARNING [20260927_044915_a55169] agent.loop: slow call\r\n",
    "2026-09-27 05:16:01,000 ERROR hermes_cli.plugins: boom\r\n",
  ];
  const recs = parseRecords(lines);
  assert.equal(recs.length, 3);
  assert.deepEqual(recs.map((r) => r.level), ["INFO", "WARNING", "ERROR"]);
  assert.equal(recs[0].component, "agent.tool_executor");
  assert.equal(recs[0].message, "tool terminal completed (1.51s)");
  assert.equal(recs[0].time, "05:15:56");
  assert.ok(!recs[2].message.includes("\r"));
});

test("parseRecords keeps CRLF continuation lines on the owning record", () => {
  const recs = parseRecords([
    "2026-09-27 05:16:01,000 ERROR x.y: failed\r\n",
    "Traceback (most recent call last):\r\n",
    "  File \"a.py\", line 1\r\n",
  ]);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].text.split("\n").length, 3);
  assert.ok(!recs[0].text.includes("\r"));
});

// ── Matrix: only whole glyph rows are ever painted ──────────────────────

test("matrixRows never yields a partially visible row", () => {
  for (const h of [0, 13, 14, 100, 181, 206, 500]) {
    const { rows, paintHeight } = matrixRows(h, 14);
    assert.equal(paintHeight, rows * 14);
    assert.ok(paintHeight <= h);
    assert.ok(h - paintHeight < 14);
  }
});

// ── Widget state: stale data beats an error, offline beats unavailable ──

const base = () => ({ status: null, system: null, analytics: null, cron: null, sessions: null, logs: null, errors: new Set() });

test("widgetState: no data source is always ok", () => {
  assert.equal(widgetState(null, base()), "ok");
});

test("widgetState: loading until the first response", () => {
  assert.equal(widgetState("cron", base()), "loading");
});

test("widgetState: keeps showing last good data when a poll fails", () => {
  const d = { ...base(), cron: { jobs: [] }, errors: new Set(["cron"]) };
  assert.equal(widgetState("cron", d), "stale");
});

test("widgetState: offline when the backend itself is unreachable", () => {
  const d = { ...base(), errors: new Set(["status", "cron"]) };
  assert.equal(widgetState("cron", d), "offline");
});

test("widgetState: unavailable when only this source fails", () => {
  const d = { ...base(), status: { version: "x" }, errors: new Set(["cron"]) };
  assert.equal(widgetState("cron", d), "unavailable");
});
