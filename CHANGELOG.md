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
