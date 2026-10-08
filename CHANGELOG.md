# Changelog

All notable changes to the Home dashboard plugin.

## Versioning convention

Small releases, shipped often:

- **Patch** (`1.3.x`) — bug fixes, polish, tweaks to existing widgets,
  micro-features. The default bump for day-to-day work.
- **Minor** (`1.4.0`) — a batch of new widgets, or a feature that changes
  how the Home itself works.
- **Major** (`2.0.0`) — redesigns or breaking changes to the persisted
  layout schema.

Every release updates the version in `package.json`, `plugin.yaml` and
`dashboard/manifest.json`, rebuilds both bundles (`npm run build`), and
commits the regenerated `dashboard/dist/` + `desktop/plugin.js` (installs
clone, they never build).

---

## 1.5.2 — 2026-10-08

- **Tokens:** the **model** / **provider** views are charts now, not a text list.
  **bars** draws one stacked column per day (one band per model/provider),
  **line** draws one line per series, and both carry a **legend** — hovering an
  entry highlights its series in the chart (the others fade back), and a
  truncated name always has its full form in the tooltip. The colours are a
  fixed blue ramp: seven lightness steps, neighbouring series always kept two
  steps apart, and the misc bucket (`其他`, ranks 7+) in a neutral grey.
- **Tokens:** the grouped views are on the **same ruler** as the day view. They
  read a new read-only plugin route (`GET /analytics/series`), which counts the
  primary usage only (`session_model_usage.task = ''`), so a day's stacked
  columns add up to that day's bar; the big number and the `in` / `out` / `cost`
  line come from the same `/analytics` totals. The per-bucket `$` and the
  `含后台辅助` note of 1.5.1 are gone, and the range / chart / totals / grouping
  controls are a single line that shrinks instead of wrapping.
- **Version:** 1.5.2 (patch: one existing widget's presentation plus a
  plugin-local read-only route).

## 1.5.1 — 2026-10-07

- **Tokens:** the hover control gains a second line — **day** (unchanged) /
  **model** / **provider**. The grouped views list the range's top six buckets
  by tokens with their estimated cost, taken from the core models analytics,
  which folds in background/auxiliary usage (the widget says so: `含后台辅助`;
  the buckets therefore add up to more than the day view's total). Note the
  accounting: grouping attributes every API call to the model/provider active
  **at call time**, while the day view (and the `sessions` table) attributes a
  whole session to its **final** pair — so a session that switched models
  mid-way lands in different buckets, and the two views differ in distribution
  as well as in total. Both are correct; they are just different accounting.
  The four billing-provider spellings of one endpoint (`alibaba-cn`, `alibaba`,
  `bailian-others`, `dashscope-others`) merge into **Alibaba**; unset providers
  show as **未标注**. The range, line↔bars and totals controls behave exactly
  as before.
- **Sessions:** a **recent / tokens** switch sorts the loaded list by token use
  (largest first, stable for ties) and every row shows its token count. One poll
  now loads 20 sessions instead of 9; paging is still 3 per page.
- **Version:** `package-lock.json` had drifted to 1.3.0 — all four version
  fields are now 1.5.1.

## 1.5.0 — 2026-09-27

Polish pass, verified in a live Hermes Desktop.

- **Logs:** Windows hosts return CRLF lines, which the parser read as one fake
  `INFO` record holding the raw tail (the "INFO … INFO" line). Lines are now
  split correctly, the `[session]` tag no longer hides the component, rows show
  `HH:MM:SS`, and the list scrolls inside the widget with a soft bottom fade
  instead of spilling past the edge.
- **Widget states:** the single `● no data` is replaced by `offline` (backend
  unreachable), `unavailable` (one source failing) and a `stale` header tag
  that keeps the last good data on screen during a failed poll.
- **Agent:** the stats row no longer overflows 8px below the widget.
- **Matrix:** the canvas is sized to whole glyph rows — no half-cut bottom row.
- **Sessions / Cron:** names ellipsize at the real column width with the full
  name on hover, instead of a fixed character cut ("bitacoras-guayab").
- **Contrast:** widget headers and the Hermes version caption are readable.

## 1.4.1 — 2026-09-27

- **Fix: HUD mode no longer breaks.** The "open Home once per start" hook
  also ran inside Desktop's auxiliary windows (HUD, pop-out session, pop-out
  browser), each of which has its own `sessionStorage`. In the HUD it
  navigated to `/home`, replacing the chat with a clipped Home page and
  dropping the session route. Windows carrying `?win=` are now left alone.

## 1.4.0 — 2026-09-27

- **Fix: plugin loads again on current Hermes.** Hermes removed the
  `hermes_cli.web_server.*` compatibility re-exports on 2026-09-14, so the
  backend (`plugin_api.py`) was refused at load and the Home layout/data
  routes stopped working. The Desktop data adapters now import from the
  defining modules under `hermes_cli.web_routers` (`status`, `analytics`,
  `cron`, `sessions`); analytics range clamp aligned to the host's 1–365 days.
- **Agent widget** with take-control theater mode, animated live scene,
  markdown scene and tool-first priority.
- **Install (Windows):** the Desktop plugin is copied instead of junctioned,
  and backups live outside `desktop-plugins/`.

## 1.3.0 — 2026-08-03

- **Host: live graphs view.** Third view in the hover cycle
  (meters → detail → graphs): four sparklines — cpu, ram, load, proc —
  over a rolling one-minute window sampled every 2s. Tokens-style area
  gradient; percent signals pin to 0–100, load/proc autoscale to the
  window peak; missing sources draw as gaps, never zeros.
- Pure series logic extracted to `hostSeries.ts` with `node:test`
  coverage (21 tests). Legacy persisted view values coerce safely.
- `layout.json` (per-install user state) is now gitignored.

## 1.2.1 and earlier

Pre-changelog era: initial grid + 16 widgets, Tokens/Logs redesign,
native Desktop runtime plugin and installer, caduceus refinements.
See `git log` for details.
