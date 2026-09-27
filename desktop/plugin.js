import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { host } from "@hermes/plugin-sdk";
import { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle, useCallback } from "react";
function getDashboardHost() {
  const sdk = window.__HERMES_PLUGIN_SDK__;
  if (!sdk) throw new Error("Hermes plugin SDK not available");
  const dashboard = sdk;
  return {
    ...dashboard,
    navigateTo: (routePath) => window.location.assign(routePath)
  };
}
let configuredHost = null;
function configureHomeHost(host2) {
  configuredHost = host2;
}
function getHost() {
  return configuredHost ?? getDashboardHost();
}
const api = {
  getStatus: () => getHost().api.getStatus(),
  getSystemStats: () => getHost().api.getSystemStats(),
  getAnalytics: (days) => getHost().api.getAnalytics(days),
  getCronJobs: (profile) => getHost().api.getCronJobs(profile),
  getSessions: (limit, offset) => getHost().api.getSessions(limit, offset),
  getLogs: (params) => getHost().api.getLogs(params)
};
function fetchJSON(url, init) {
  return getHost().fetchJSON(url, init);
}
function navigateTo(routePath) {
  getHost().navigateTo(routePath);
}
function onGatewayEvent(type, listener) {
  const h = getHost();
  if (!h.onEvent) return null;
  return h.onEvent(type, listener);
}
const GRID_COLS = 12;
function collide(a, b) {
  return a.gx < b.gx + b.gw && a.gx + a.gw > b.gx && a.gy < b.gy + b.gh && a.gy + a.gh > b.gy;
}
function reflow(box, others) {
  const moved = /* @__PURE__ */ new Map();
  const rest = others.map((i) => ({ ...i })).sort((a, b) => a.gy - b.gy);
  const placed = [box];
  for (const r of rest) {
    let guard = 0;
    while (placed.some((p) => collide(r, p)) && guard++ < 100) {
      const blocker = placed.find((p) => collide(r, p));
      r.gy = blocker.gy + blocker.gh;
    }
    placed.push(r);
    const original = others.find((o) => o.id === r.id);
    if (r.gy !== original.gy) moved.set(r.id, r.gy);
  }
  return moved;
}
function findSwapTarget(pgx, pgy, dragged, others) {
  for (const t of others) {
    if (t.id === dragged.id || t.gw !== dragged.gw || t.gh !== dragged.gh) continue;
    if (pgx >= t.gx && pgx < t.gx + t.gw && pgy >= t.gy && pgy < t.gy + t.gh) {
      return t;
    }
  }
  return null;
}
function findFreeSlot(layout, size, cols = GRID_COLS) {
  const maxRow = layout.reduce((m, w) => Math.max(m, w.gy + w.gh), 0);
  for (let gy = 0; gy <= maxRow; gy++) {
    for (let gx = 0; gx <= cols - size.gw; gx++) {
      const box = { gx, gy, gw: size.gw, gh: size.gh };
      if (!layout.some((w) => collide(box, w))) return { gx, gy };
    }
  }
  return { gx: 0, gy: maxRow };
}
function clampPosition(gx, gy, gw, _gh, cols = GRID_COLS) {
  return {
    gx: Math.max(0, Math.min(cols - gw, Math.round(gx))),
    gy: Math.max(0, Math.round(gy))
  };
}
function swallow(e) {
  e.stopPropagation();
}
function HoverCtl({ children, className }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: `hover-ctl${className ? ` ${className}` : ""}`,
      onClick: swallow,
      onPointerDown: swallow,
      children
    }
  );
}
function HoverArrows({
  onPrev,
  onNext,
  label,
  onLabelClick,
  prevDisabled,
  nextDisabled,
  className
}) {
  return /* @__PURE__ */ jsxs(HoverCtl, { className: `hover-arrows${className ? ` ${className}` : ""}`, children: [
    /* @__PURE__ */ jsx(
      "button",
      {
        className: "hv-arrow",
        "aria-label": "previous",
        disabled: prevDisabled,
        onClick: (e) => {
          swallow(e);
          onPrev();
        },
        children: "‹"
      }
    ),
    label !== void 0 && (onLabelClick ? /* @__PURE__ */ jsx(
      "button",
      {
        className: "hv-label hv-label-btn",
        onClick: (e) => {
          swallow(e);
          onLabelClick();
        },
        children: label
      }
    ) : /* @__PURE__ */ jsx("span", { className: "hv-label", children: label })),
    /* @__PURE__ */ jsx(
      "button",
      {
        className: "hv-arrow",
        "aria-label": "next",
        disabled: nextDisabled,
        onClick: (e) => {
          swallow(e);
          onNext();
        },
        children: "›"
      }
    )
  ] });
}
function readNotes(p) {
  if (!Array.isArray(p.notes)) return [];
  return p.notes.filter(
    (n) => typeof n === "object" && n !== null && typeof n.id === "string" && typeof n.text === "string" && typeof n.done === "boolean"
  );
}
function NotesWidget({ widgetProps, onWidgetPropsChange }) {
  const notes = readNotes(widgetProps);
  const [editingId, setEditingId] = useState(null);
  const commit = (next) => onWidgetPropsChange({ ...widgetProps, notes: next });
  const add = () => {
    const note = { id: crypto.randomUUID(), text: "", done: false };
    commit([...notes, note]);
    setEditingId(note.id);
  };
  const toggle = (id) => commit(notes.map((n) => n.id === id ? { ...n, done: !n.done } : n));
  const save = (id, raw) => {
    const text = raw.trim();
    setEditingId(null);
    commit(text === "" ? notes.filter((n) => n.id !== id) : notes.map((n) => n.id === id ? { ...n, text } : n));
  };
  const doneCount = notes.filter((n) => n.done).length;
  return /* @__PURE__ */ jsxs("div", { className: "home-notes", children: [
    doneCount > 0 && /* @__PURE__ */ jsx(HoverCtl, { children: /* @__PURE__ */ jsx("button", { className: "hv-opt", onClick: () => commit(notes.filter((n) => !n.done)), children: "clear done" }) }),
    notes.length === 0 && editingId === null && /* @__PURE__ */ jsx("span", { className: "dim", children: "no notes — add one with +" }),
    notes.map(
      (n) => editingId === n.id ? /* @__PURE__ */ jsxs("div", { className: "note-row", children: [
        /* @__PURE__ */ jsx("span", { className: "note-mark dim", children: "·" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            className: "note-input",
            autoFocus: true,
            defaultValue: n.text,
            onBlur: (e) => save(n.id, e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") save(n.id, e.currentTarget.value);
              if (e.key === "Escape") save(n.id, n.text);
            }
          }
        )
      ] }, n.id) : /* @__PURE__ */ jsxs("div", { className: "note-row", children: [
        /* @__PURE__ */ jsx(
          "span",
          {
            className: `note-mark${n.done ? " done" : ""}`,
            onClick: () => toggle(n.id),
            title: n.done ? "restore" : "strike through",
            children: n.done ? "✕" : "·"
          }
        ),
        /* @__PURE__ */ jsx(
          "span",
          {
            className: `note-text${n.done ? " done" : ""}`,
            onClick: () => setEditingId(n.id),
            children: n.text
          }
        )
      ] }, n.id)
    ),
    /* @__PURE__ */ jsx("button", { className: "note-add", onClick: add, "aria-label": "Add note", children: "+" })
  ] });
}
function asciiArtClass(name) {
  return name === "caduceus" ? "home-ascii home-ascii-caduceus" : "home-ascii";
}
const CADUCEUS = `⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⡀⠀⣀⣀⠀⢀⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢀⣠⣴⣾⣿⣿⣇⠸⣿⣿⠇⣸⣿⣿⣷⣦⣄⡀⠀⠀⠀⠀⠀⠀
⠀⢀⣠⣴⣶⠿⠋⣩⡿⣿⡿⠻⣿⡇⢠⡄⢸⣿⠟⢿⣿⢿⣍⠙⠿⣶⣦⣄⡀⠀
⠀⠀⠉⠉⠁⠶⠟⠋⠀⠉⠀⢀⣈⣁⡈⢁⣈⣁⡀⠀⠉⠀⠙⠻⠶⠈⠉⠉⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⣿⡿⠛⢁⡈⠛⢿⣿⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠿⣿⣦⣤⣈⠁⢠⣴⣿⠿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠉⠻⢿⣿⣦⡉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⢷⣦⣈⠛⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣴⠦⠈⠙⠿⣦⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣿⣤⡈⠁⢤⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠛⠷⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⠑⢶⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⠁⢰⡆⠈⡿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠳⠈⣡⠞⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`;
const PAD$1 = "⠀";
const INK = "⣿";
const W = 29;
function row(lead, fill) {
  return PAD$1.repeat(lead) + INK.repeat(fill) + PAD$1.repeat(Math.max(0, W - lead - fill));
}
const pyramid = Array.from({ length: 15 }, (_, r) => row(14 - r, 2 * r + 1)).join("\n");
const diamond = Array.from({ length: 15 }, (_, r) => {
  const k = Math.min(r, 14 - r);
  return row(14 - k, 2 * k + 1);
}).join("\n");
const ARTS = [
  { name: "caduceus", art: CADUCEUS },
  { name: "pyramid", art: pyramid },
  { name: "diamond", art: diamond }
];
function AsciiWidget({ status, widgetProps, onWidgetPropsChange }) {
  const version = status?.version;
  const raw = typeof widgetProps.artIndex === "number" ? widgetProps.artIndex : 0;
  const idx = (raw % ARTS.length + ARTS.length) % ARTS.length;
  const cycle = (dir) => onWidgetPropsChange({ ...widgetProps, artIndex: (idx + dir + ARTS.length) % ARTS.length });
  return /* @__PURE__ */ jsxs("div", { className: "home-ascii-wrap", children: [
    /* @__PURE__ */ jsx(HoverArrows, { onPrev: () => cycle(-1), onNext: () => cycle(1), label: ARTS[idx].name }),
    /* @__PURE__ */ jsx("div", { className: asciiArtClass(ARTS[idx].name), children: ARTS[idx].art }),
    /* @__PURE__ */ jsxs("div", { className: "home-ascii-ver", children: [
      "HERMES-AGENT",
      version ? ` · v${version}` : ""
    ] })
  ] });
}
function ClockWidget({ widgetProps, onWidgetPropsChange }) {
  const is12 = widgetProps.format === "12";
  const showSeconds = widgetProps.showSeconds === true;
  const [now, setNow] = useState(() => /* @__PURE__ */ new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(/* @__PURE__ */ new Date()), showSeconds ? 1e3 : 5e3);
    return () => clearInterval(t);
  }, [showSeconds]);
  const set = (patch) => onWidgetPropsChange({ ...widgetProps, ...patch });
  let h = now.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  if (is12) {
    h = h % 12 || 12;
  }
  const hh = String(h).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return /* @__PURE__ */ jsxs("div", { className: "home-clock-wrap", children: [
    /* @__PURE__ */ jsxs(HoverCtl, { children: [
      /* @__PURE__ */ jsx("button", { className: "hv-opt", onClick: () => set({ format: is12 ? "24" : "12" }), children: is12 ? "12h" : "24h" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: `hv-opt${showSeconds ? " on" : ""}`,
          onClick: () => set({ showSeconds: !showSeconds }),
          children: "s"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "home-clock", children: [
      hh,
      ":",
      mm,
      showSeconds && /* @__PURE__ */ jsxs(Fragment, { children: [
        ":",
        ss
      ] }),
      is12 && /* @__PURE__ */ jsx("span", { className: "home-clock-ampm", children: ampm })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "home-clock-sub", children: now.toLocaleDateString(void 0, { weekday: "long", day: "numeric", month: "long" }) })
  ] });
}
function matrixRows(height, rowH) {
  const rows = Math.max(0, Math.floor(height / rowH));
  return { rows, paintHeight: rows * rowH };
}
const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ01☿";
const COL_W = 13;
const ROW_H = 14;
const TICK_MS$1 = 66;
const SPEEDS$1 = [0.5, 1, 2];
function MatrixWidget({ widgetProps, onWidgetPropsChange }) {
  const ref = useRef(null);
  const speedRef = useRef(1);
  const speed = typeof widgetProps.speed === "number" ? widgetProps.speed : 1;
  speedRef.current = speed;
  const stepSpeed = (dir) => {
    const i = (SPEEDS$1.indexOf(speed) + dir + SPEEDS$1.length) % SPEEDS$1.length;
    onWidgetPropsChange({ ...widgetProps, speed: SPEEDS$1[i] });
  };
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let drops = [];
    let accent = "#d4af37";
    const fit = () => {
      const slot = cv.parentElement.getBoundingClientRect();
      const avail = slot.height - cv.offsetTop - 6;
      const { paintHeight } = matrixRows(avail, ROW_H);
      cv.width = Math.max(10, Math.floor(slot.width));
      cv.height = Math.max(ROW_H, paintHeight);
      cv.style.height = `${cv.height}px`;
      accent = getComputedStyle(cv).getPropertyValue("--home-accent").trim() || accent;
      drops = Array.from(
        { length: Math.floor(cv.width / COL_W) },
        () => Math.floor(Math.random() * -30)
      );
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv.parentElement);
    const t = setInterval(() => {
      if (document.hidden) return;
      const step = speedRef.current;
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.font = "12px monospace";
      drops.forEach((y, i) => {
        ctx.fillStyle = Math.random() < 0.12 ? "#ffffff" : accent;
        ctx.fillText(
          GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
          i * COL_W,
          y * ROW_H
        );
        drops[i] = y * ROW_H > cv.height && Math.random() > 0.975 ? 0 : y + step;
      });
    }, TICK_MS$1);
    return () => {
      ro.disconnect();
      clearInterval(t);
    };
  }, []);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      HoverArrows,
      {
        onPrev: () => stepSpeed(-1),
        onNext: () => stepSpeed(1),
        label: `${speed}×`
      }
    ),
    /* @__PURE__ */ jsx("canvas", { ref, className: "home-matrix-c" })
  ] });
}
function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
function Row$1({ label, val }) {
  return /* @__PURE__ */ jsxs("div", { className: "row", children: [
    /* @__PURE__ */ jsx("span", { className: "dim", children: label }),
    /* @__PURE__ */ jsx("span", { children: val })
  ] });
}
function GatewayWidget({ status }) {
  if (!status) return /* @__PURE__ */ jsx("span", { className: "dim", children: "loading…" });
  const platforms = Object.entries(status.gateway_platforms ?? {});
  const configStr = `v${status.config_version}${status.config_version !== status.latest_config_version ? ` → v${status.latest_config_version}` : ""}`;
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsxs("div", { className: "rows", children: [
      /* @__PURE__ */ jsxs("div", { className: "row", children: [
        /* @__PURE__ */ jsx("span", { className: "dim", children: "status" }),
        /* @__PURE__ */ jsx("span", { className: status.gateway_running ? "ok" : "werr", children: status.gateway_running ? "● online" : "● offline" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "row", children: [
        /* @__PURE__ */ jsx("span", { className: "dim", children: "state" }),
        /* @__PURE__ */ jsx("span", { children: status.gateway_state ?? "—" })
      ] }),
      platforms.map(([name, p]) => /* @__PURE__ */ jsxs("div", { className: "row", children: [
        /* @__PURE__ */ jsx("span", { className: "dim", children: name }),
        /* @__PURE__ */ jsx("span", { className: p.state === "running" ? "ok" : "dim", children: p.state })
      ] }, name))
    ] }),
    /* @__PURE__ */ jsx("div", { className: "hover-reveal", children: /* @__PURE__ */ jsxs("div", { className: "rows", children: [
      status.gateway_pid != null && /* @__PURE__ */ jsx(Row$1, { label: "pid", val: String(status.gateway_pid) }),
      status.gateway_exit_reason && /* @__PURE__ */ jsx(Row$1, { label: "exit", val: status.gateway_exit_reason.slice(0, 28) }),
      status.gateway_health_url && /* @__PURE__ */ jsx(Row$1, { label: "health", val: hostOf(status.gateway_health_url) }),
      /* @__PURE__ */ jsx(Row$1, { label: "config", val: configStr }),
      /* @__PURE__ */ jsx(Row$1, { label: "version", val: `v${status.version}` })
    ] }) })
  ] });
}
const PER_PAGE$1 = 3;
function SessionsWidget({
  status,
  sessions
}) {
  const [page, setPage] = useState(0);
  if (!status && !sessions) return /* @__PURE__ */ jsx("span", { className: "dim", children: "loading…" });
  const all = sessions?.sessions ?? [];
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE$1));
  const p = Math.min(page, pages - 1);
  const slice = all.slice(p * PER_PAGE$1, p * PER_PAGE$1 + PER_PAGE$1);
  return /* @__PURE__ */ jsxs("div", { children: [
    pages > 1 && /* @__PURE__ */ jsx(
      HoverArrows,
      {
        onPrev: () => setPage(Math.max(0, p - 1)),
        onNext: () => setPage(Math.min(pages - 1, p + 1)),
        label: `${p + 1}/${pages}`,
        prevDisabled: p <= 0,
        nextDisabled: p >= pages - 1
      }
    ),
    /* @__PURE__ */ jsx("span", { className: "bigval", children: status?.active_sessions ?? "—" }),
    /* @__PURE__ */ jsx("span", { className: "dim", children: " active" }),
    /* @__PURE__ */ jsx("div", { className: "rows", children: slice.map((s) => /* @__PURE__ */ jsxs("div", { className: "row", children: [
      /* @__PURE__ */ jsx("span", { className: "dim row-name", title: s.title ?? s.source ?? s.id, children: s.title ?? s.source ?? s.id }),
      /* @__PURE__ */ jsx("span", { className: s.is_active ? "ok" : "dim", children: s.is_active ? "live" : "idle" })
    ] }, s.id)) })
  ] });
}
function formatTokenCount(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)}K`;
  return String(n);
}
function parseDay(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(day);
}
function toBars(daily, byMonth) {
  if (!byMonth) {
    return daily.map((d) => {
      const date = parseDay(d.day);
      const label = isNaN(date.getTime()) ? d.day : date.toLocaleDateString(void 0, { month: "short", day: "numeric" });
      return { key: d.day, label, tokens: d.input_tokens + d.output_tokens, cost: d.estimated_cost };
    });
  }
  const months = /* @__PURE__ */ new Map();
  for (const d of daily) {
    const date = parseDay(d.day);
    const valid = !isNaN(date.getTime());
    const key = valid ? `${date.getFullYear()}-${date.getMonth()}` : d.day.slice(0, 7);
    const label = valid ? date.toLocaleDateString(void 0, { month: "short" }) : key;
    const sort = valid ? date.getFullYear() * 12 + date.getMonth() : 0;
    const cur = months.get(key) ?? { key, label, tokens: 0, cost: 0, sort };
    cur.tokens += d.input_tokens + d.output_tokens;
    cur.cost += d.estimated_cost;
    months.set(key, cur);
  }
  return [...months.values()].sort((a, b) => a.sort - b.sort).map(({ sort, ...b }) => b);
}
const RANGES = [
  { key: "week", label: "7 days", days: 7, byMonth: false },
  { key: "month", label: "1 month", days: 30, byMonth: false },
  { key: "halfyear", label: "6 months", days: 180, byMonth: true }
];
let gradSeq$1 = 0;
function TokensWidget({ analytics, widgetProps, onWidgetPropsChange }) {
  const rangeKey = RANGES.find((r) => r.key === widgetProps.range)?.key ?? "week";
  const range = RANGES.find((r) => r.key === rangeKey);
  const idx = RANGES.findIndex((r) => r.key === rangeKey);
  const chart = widgetProps.chart === "bars" ? "bars" : "line";
  const statsOn = widgetProps.stats !== false;
  const [gid] = useState(() => `tok-grad-${gradSeq$1++}`);
  const [fetched, setFetched] = useState(null);
  const [failed, setFailed] = useState(false);
  const [tip, setTip] = useState(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setFetched(null);
    setFailed(false);
    api.getAnalytics(range.days).then((r) => {
      if (!cancelled) setFetched(r);
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [range.days]);
  const setProp = (patch) => onWidgetPropsChange({ ...widgetProps, ...patch });
  const cycle = (dir) => setProp({ range: RANGES[(idx + dir + RANGES.length) % RANGES.length].key });
  const controls = /* @__PURE__ */ jsxs(HoverCtl, { className: "tok-ctl", children: [
    /* @__PURE__ */ jsx("button", { className: "hv-arrow", "aria-label": "previous", onClick: () => cycle(-1), children: "‹" }),
    /* @__PURE__ */ jsx("span", { className: "hv-label", children: range.label }),
    /* @__PURE__ */ jsx("button", { className: "hv-arrow", "aria-label": "next", onClick: () => cycle(1), children: "›" }),
    /* @__PURE__ */ jsx("span", { className: "tok-div" }),
    /* @__PURE__ */ jsx(
      "button",
      {
        className: `hv-opt${chart === "line" ? " on" : ""}`,
        onClick: () => setProp({ chart: chart === "line" ? "bars" : "line" }),
        title: "line / bars view",
        children: "line"
      }
    ),
    /* @__PURE__ */ jsx(
      "button",
      {
        className: `hv-opt${statsOn ? " on" : ""}`,
        onClick: () => setProp({ stats: !statsOn }),
        title: "show / hide totals",
        children: "totals"
      }
    )
  ] });
  const view = fetched ?? (failed ? analytics : null);
  const bars = useMemo(
    () => toBars(view?.daily ?? [], range.byMonth),
    [view, range.byMonth]
  );
  if (!view) {
    return /* @__PURE__ */ jsxs("div", { children: [
      controls,
      /* @__PURE__ */ jsx("span", { className: "dim", children: failed ? "unavailable" : "loading…" })
    ] });
  }
  const t = view.totals;
  const total = t.total_input + t.total_output;
  const n = bars.length;
  const max = Math.max(1, ...bars.map((b) => b.tokens));
  const H = 100, W2 = 100, PAD2 = 3;
  const coords = bars.map((b, i) => [
    n <= 1 ? W2 / 2 : i / (n - 1) * W2,
    H - PAD2 - b.tokens / max * (H - PAD2 * 2)
  ]);
  const linePath = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const areaPath2 = n ? `${linePath} L${coords[n - 1][0].toFixed(2)},${H} L${coords[0][0].toFixed(2)},${H} Z` : "";
  return /* @__PURE__ */ jsxs("div", { children: [
    controls,
    /* @__PURE__ */ jsx("span", { className: "bigval", children: formatTokenCount(total) }),
    /* @__PURE__ */ jsxs("span", { className: "dim", children: [
      " ",
      range.label,
      failed ? " · day*" : ""
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "home-spark-wrap", onMouseLeave: () => setShow(false), children: [
      tip && /* @__PURE__ */ jsxs(
        "div",
        {
          className: `home-spark-tip${show ? " show" : ""}`,
          style: { left: `${tip.frac * 100}%`, transform: `translateX(${-tip.frac * 100}%)` },
          children: [
            /* @__PURE__ */ jsx("b", { children: tip.bar.label }),
            " · ",
            formatTokenCount(tip.bar.tokens),
            " · $",
            tip.bar.cost.toFixed(2)
          ]
        }
      ),
      chart === "line" ? /* @__PURE__ */ jsxs("svg", { className: "home-area", viewBox: "0 0 100 100", preserveAspectRatio: "none", children: [
        /* @__PURE__ */ jsx("defs", { children: /* @__PURE__ */ jsxs("linearGradient", { id: gid, x1: "0", y1: "0", x2: "0", y2: "1", children: [
          /* @__PURE__ */ jsx("stop", { offset: "0%", style: { stopColor: "var(--home-accent)", stopOpacity: 0.5 } }),
          /* @__PURE__ */ jsx("stop", { offset: "100%", style: { stopColor: "var(--home-accent)", stopOpacity: 0 } })
        ] }) }),
        areaPath2 && /* @__PURE__ */ jsx("path", { d: areaPath2, fill: `url(#${gid})` }),
        linePath && /* @__PURE__ */ jsx(
          "path",
          {
            d: linePath,
            fill: "none",
            stroke: "var(--home-accent)",
            strokeWidth: 1.5,
            strokeLinejoin: "round",
            strokeLinecap: "round",
            vectorEffect: "non-scaling-stroke"
          }
        ),
        show && tip?.pt && /* @__PURE__ */ jsx("circle", { cx: tip.pt[0], cy: tip.pt[1], r: 2.4, fill: "var(--home-accent)", vectorEffect: "non-scaling-stroke" }),
        bars.map((b, i) => /* @__PURE__ */ jsx(
          "rect",
          {
            x: i * W2 / n,
            y: 0,
            width: W2 / n,
            height: H,
            fill: "transparent",
            onMouseEnter: () => {
              setTip({ bar: b, frac: n <= 1 ? 0.5 : i / (n - 1), pt: coords[i] });
              setShow(true);
            }
          },
          b.key
        ))
      ] }) : /* @__PURE__ */ jsx("div", { className: "home-spark", children: bars.map((b, i) => /* @__PURE__ */ jsx(
        "i",
        {
          onMouseEnter: () => {
            setTip({ bar: b, frac: (i + 0.5) / n });
            setShow(true);
          },
          style: { height: `${Math.max(8, b.tokens / max * 100)}%` }
        },
        b.key
      )) })
    ] }),
    statsOn && /* @__PURE__ */ jsxs("div", { className: "tok-stats", children: [
      /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx("span", { className: "dim", children: "in" }),
        " ",
        formatTokenCount(t.total_input)
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx("span", { className: "dim", children: "out" }),
        " ",
        formatTokenCount(t.total_output)
      ] }),
      /* @__PURE__ */ jsxs("span", { children: [
        /* @__PURE__ */ jsx("span", { className: "dim", children: "cost" }),
        " ",
        /* @__PURE__ */ jsxs("span", { className: "ok", children: [
          "$",
          t.total_estimated_cost.toFixed(2)
        ] })
      ] })
    ] })
  ] });
}
const MB$1 = 1024 ** 2;
const HOST_SIGNALS = [
  { key: "cpu", label: "cpu", fixedMax: 100, format: (v) => `${Math.round(v)}%` },
  { key: "ram", label: "ram", fixedMax: 100, format: (v) => `${Math.round(v)}%` },
  { key: "load", label: "load", fixedMax: void 0, format: (v) => v.toFixed(2) },
  { key: "proc", label: "proc", fixedMax: void 0, format: (v) => `${Math.round(v / MB$1)}M` }
];
const SAMPLE_MS = 2e3;
const BUFFER_CAP = 31;
const HOST_VIEWS = ["meters", "detail", "graphs"];
function coerceHostView(value) {
  return HOST_VIEWS.includes(value) ? value : "meters";
}
function toSample(system, t) {
  return {
    t,
    cpu: system.cpu_percent ?? null,
    ram: system.memory ? system.memory.percent : null,
    load: system.load_avg && system.load_avg.length > 0 ? system.load_avg[0] : null,
    proc: system.process ? system.process.rss : null
  };
}
function pushSample(buf, sample, cap) {
  const next = [...buf, sample];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
function seriesOf(buf, key) {
  return buf.map((s) => s[key]);
}
function signalMax(values, fixedMax) {
  if (fixedMax !== void 0) return fixedMax;
  let peak = 0;
  for (const v of values) if (v !== null && v > peak) peak = v;
  return peak > 0 ? peak : 1;
}
function areaPath(line, H) {
  if (!line || !line.includes("L") || line.indexOf("M", 1) !== -1) return "";
  const firstX = line.slice(1, line.indexOf(","));
  const lastX = line.slice(line.lastIndexOf("L") + 1, line.lastIndexOf(","));
  return `${line} L${lastX},${H} L${firstX},${H} Z`;
}
function seriesPath(values, max, W2, H, pad2) {
  const n = values.length;
  if (n === 0) return "";
  const parts = [];
  let penDown = false;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null) {
      penDown = false;
      continue;
    }
    const x = n <= 1 ? W2 / 2 : i / (n - 1) * W2;
    const y = H - pad2 - Math.min(v, max) / max * (H - pad2 * 2);
    parts.push(`${penDown ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`);
    penDown = true;
  }
  return parts.join(" ");
}
const GB = 1024 ** 3;
const MB = 1024 ** 2;
function Meter({ label, pct, val }) {
  return /* @__PURE__ */ jsxs("div", { className: "meter", children: [
    /* @__PURE__ */ jsx("span", { className: "lbl", children: label }),
    /* @__PURE__ */ jsx("div", { className: "track", children: /* @__PURE__ */ jsx("div", { className: "fill", style: { width: `${Math.min(100, Math.max(0, pct))}%` } }) }),
    /* @__PURE__ */ jsx("span", { className: "val", children: val })
  ] });
}
function Row({ label, val }) {
  return /* @__PURE__ */ jsxs("div", { className: "row", children: [
    /* @__PURE__ */ jsx("span", { className: "dim", children: label }),
    /* @__PURE__ */ jsx("span", { children: val })
  ] });
}
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor(seconds % 86400 / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${Math.floor(seconds % 3600 / 60)}m`;
}
let gradSeq = 0;
function Spark({ values, fixedMax, label, readout, gid }) {
  const max = signalMax(values, fixedMax);
  const H = 100, W2 = 100, PAD2 = 6;
  const line = seriesPath(values, max, W2, H, PAD2);
  const area = areaPath(line, H);
  return /* @__PURE__ */ jsxs("div", { className: "host-spark", children: [
    /* @__PURE__ */ jsxs("div", { className: "host-spark-head", children: [
      /* @__PURE__ */ jsx("span", { className: "dim", children: label }),
      /* @__PURE__ */ jsx("span", { className: "val", children: readout })
    ] }),
    /* @__PURE__ */ jsxs("svg", { className: "home-area", viewBox: "0 0 100 100", preserveAspectRatio: "none", children: [
      /* @__PURE__ */ jsx("defs", { children: /* @__PURE__ */ jsxs("linearGradient", { id: gid, x1: "0", y1: "0", x2: "0", y2: "1", children: [
        /* @__PURE__ */ jsx("stop", { offset: "0%", style: { stopColor: "var(--home-accent)", stopOpacity: 0.4 } }),
        /* @__PURE__ */ jsx("stop", { offset: "100%", style: { stopColor: "var(--home-accent)", stopOpacity: 0 } })
      ] }) }),
      area && /* @__PURE__ */ jsx("path", { d: area, fill: `url(#${gid})` }),
      line && /* @__PURE__ */ jsx(
        "path",
        {
          d: line,
          fill: "none",
          stroke: "var(--home-accent)",
          strokeWidth: 1.5,
          strokeLinejoin: "round",
          strokeLinecap: "round",
          vectorEffect: "non-scaling-stroke"
        }
      )
    ] })
  ] });
}
function HostWidget({ system, widgetProps, onWidgetPropsChange }) {
  const view = coerceHostView(widgetProps.view);
  const [buf, setBuf] = useState([]);
  const latest = useRef(null);
  latest.current = system;
  const [gidBase] = useState(() => `host-grad-${gradSeq++}`);
  useEffect(() => {
    if (view !== "graphs") return;
    setBuf([]);
    const tick = () => {
      const s = latest.current;
      if (!s) return;
      setBuf((prev) => pushSample(prev, toSample(s, Date.now()), BUFFER_CAP));
    };
    tick();
    const id = setInterval(tick, SAMPLE_MS);
    return () => clearInterval(id);
  }, [view]);
  if (!system) return /* @__PURE__ */ jsx("span", { className: "dim", children: "loading…" });
  const cycle = (dir) => {
    const i = (HOST_VIEWS.indexOf(view) + dir + HOST_VIEWS.length) % HOST_VIEWS.length;
    onWidgetPropsChange({ ...widgetProps, view: HOST_VIEWS[i] });
  };
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(HoverArrows, { onPrev: () => cycle(-1), onNext: () => cycle(1), label: view }),
    view === "meters" && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: "meters", children: [
        system.cpu_percent !== void 0 && /* @__PURE__ */ jsx(Meter, { label: "cpu", pct: system.cpu_percent, val: `${Math.round(system.cpu_percent)}%` }),
        system.memory && /* @__PURE__ */ jsx(Meter, { label: "ram", pct: system.memory.percent, val: `${(system.memory.used / GB).toFixed(1)}G` }),
        system.disk && /* @__PURE__ */ jsx(Meter, { label: "disk", pct: system.disk.percent, val: `${Math.round(system.disk.percent)}%` })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "row", children: [
        /* @__PURE__ */ jsx("span", { className: "dim", children: system.hostname }),
        /* @__PURE__ */ jsx("span", { children: system.uptime_seconds !== void 0 ? formatUptime(system.uptime_seconds) : "—" })
      ] })
    ] }),
    view === "detail" && /* @__PURE__ */ jsxs("div", { className: "rows", children: [
      system.load_avg && system.load_avg.length >= 3 && /* @__PURE__ */ jsx(Row, { label: "load", val: system.load_avg.slice(0, 3).map((n) => n.toFixed(2)).join(" ") }),
      system.cpu_count !== null && /* @__PURE__ */ jsx(Row, { label: "cores", val: String(system.cpu_count) }),
      system.memory && /* @__PURE__ */ jsx(Row, { label: "ram", val: `${(system.memory.used / GB).toFixed(1)} / ${(system.memory.total / GB).toFixed(1)}G` }),
      system.disk && /* @__PURE__ */ jsx(Row, { label: "disk", val: `${(system.disk.free / GB).toFixed(0)}G free` }),
      system.process && /* @__PURE__ */ jsx(Row, { label: "proc", val: `${(system.process.rss / MB).toFixed(0)}M · ${system.process.num_threads} thr` }),
      /* @__PURE__ */ jsx(Row, { label: "os", val: `${system.platform} ${system.arch}` })
    ] }),
    view === "graphs" && /* @__PURE__ */ jsx("div", { className: "host-sparks", children: HOST_SIGNALS.map((sig) => {
      const values = seriesOf(buf, sig.key);
      const last = [...values].reverse().find((v) => v !== null);
      return /* @__PURE__ */ jsx(
        Spark,
        {
          values,
          fixedMax: sig.fixedMax,
          label: sig.label,
          readout: last === void 0 || last === null ? "—" : sig.format(last),
          gid: `${gidBase}-${sig.key}`
        },
        sig.key
      );
    }) })
  ] });
}
const PER_PAGE = 4;
function nextRunLabel(job) {
  if (!job.next_run_at) return "—";
  const d = new Date(job.next_run_at);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function CronWidget({ cron }) {
  const [page, setPage] = useState(0);
  if (!cron) return /* @__PURE__ */ jsx("span", { className: "dim", children: "loading…" });
  const upcoming = cron.filter((j) => j.enabled && j.next_run_at).sort((a, b) => (a.next_run_at ?? "").localeCompare(b.next_run_at ?? ""));
  if (upcoming.length === 0) return /* @__PURE__ */ jsx("span", { className: "dim", children: "no scheduled jobs" });
  const pages = Math.max(1, Math.ceil(upcoming.length / PER_PAGE));
  const p = Math.min(page, pages - 1);
  const slice = upcoming.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE);
  return /* @__PURE__ */ jsxs("div", { children: [
    pages > 1 && /* @__PURE__ */ jsx(
      HoverArrows,
      {
        onPrev: () => setPage(Math.max(0, p - 1)),
        onNext: () => setPage(Math.min(pages - 1, p + 1)),
        label: `${p + 1}/${pages}`,
        prevDisabled: p <= 0,
        nextDisabled: p >= pages - 1
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "rows", children: slice.map((j) => /* @__PURE__ */ jsxs("div", { className: "row", children: [
      /* @__PURE__ */ jsx("span", { className: "dim", children: nextRunLabel(j) }),
      /* @__PURE__ */ jsx("span", { className: "row-name", title: j.name ?? j.id, children: j.name ?? j.id }),
      /* @__PURE__ */ jsx("span", { className: j.last_error ? "werr" : "ok", children: j.last_error ? "err" : "ok" })
    ] }, j.id)) })
  ] });
}
const FILES = ["agent", "errors", "gateway"];
const HEAD_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}),\d+\s+(\w+)(?:\s*\[[^\]]*\])?\s*(.*)$/;
const SHORT = {
  ERROR: "ERR",
  CRITICAL: "CRIT",
  FATAL: "FATAL",
  WARNING: "WARN",
  WARN: "WARN",
  INFO: "INFO",
  DEBUG: "DBG"
};
function levelClass(level) {
  if (level === "ERROR" || level === "CRITICAL" || level === "FATAL") return "lvl-error";
  if (level === "WARNING" || level === "WARN") return "lvl-warn";
  return "lvl-info";
}
function parseRecords(lines) {
  const out = [];
  for (const line of lines) {
    const raw = line.replace(/[\r\n]+$/, "");
    const m = HEAD_RE.exec(raw);
    if (m) {
      const rest = m[4];
      const ci = rest.indexOf(": ");
      const hasComp = ci > 0 && ci < 60 && !/\s/.test(rest.slice(0, ci));
      out.push({
        level: m[3].toUpperCase(),
        time: m[2],
        component: hasComp ? rest.slice(0, ci) : "",
        message: hasComp ? rest.slice(ci + 2) : rest,
        text: raw
      });
    } else if (out.length) {
      out[out.length - 1].text += "\n" + raw;
    } else if (raw.trim()) {
      out.push({ level: "INFO", time: "", component: "", message: raw, text: raw });
    }
  }
  return out;
}
function ErrorsWidget({ logs, widgetProps, onWidgetPropsChange }) {
  const fileKey = FILES.find((f) => f === widgetProps.file) ?? "agent";
  const idx = FILES.indexOf(fileKey);
  const [recs, setRecs] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setRecs(null);
    setFailed(false);
    const load = () => {
      api.getLogs({ file: fileKey, lines: 200 }).then((r) => {
        if (!cancelled) {
          setRecs(parseRecords(r.lines ?? []));
          setFailed(false);
        }
      }).catch(() => {
        if (!cancelled) setFailed(true);
      });
    };
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 1e4);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fileKey]);
  const cycle = (dir) => onWidgetPropsChange({ ...widgetProps, file: FILES[(idx + dir + FILES.length) % FILES.length] });
  const arrows = /* @__PURE__ */ jsx(HoverArrows, { onPrev: () => cycle(-1), onNext: () => cycle(1), label: fileKey.toUpperCase() });
  const all = recs ?? (fileKey === "agent" && logs ? parseRecords(logs.lines ?? []) : null);
  if (!all) {
    return /* @__PURE__ */ jsxs("div", { children: [
      arrows,
      /* @__PURE__ */ jsx("span", { className: "dim", children: failed ? "unavailable" : "loading…" })
    ] });
  }
  const records = [...all].reverse();
  return /* @__PURE__ */ jsxs("div", { className: "home-logs-wrap", children: [
    arrows,
    /* @__PURE__ */ jsxs("div", { className: "logs-sub", children: [
      /* @__PURE__ */ jsx("span", { className: "logs-file", children: fileKey.toUpperCase() }),
      /* @__PURE__ */ jsxs("span", { className: "dim", children: [
        records.length,
        " ",
        records.length === 1 ? "record" : "records"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "home-logs", children: records.length === 0 ? /* @__PURE__ */ jsx("span", { className: "dim", children: "no records" }) : records.map((r, i) => /* @__PURE__ */ jsxs("div", { className: "log-row", title: r.text, children: [
      /* @__PURE__ */ jsx("span", { className: `log-lvl ${levelClass(r.level)}`, children: SHORT[r.level] ?? r.level.slice(0, 4) }),
      r.time && /* @__PURE__ */ jsx("span", { className: "log-time", children: r.time }),
      /* @__PURE__ */ jsx("span", { className: "log-msg", children: r.message })
    ] }, `${r.time}-${i}`)) })
  ] });
}
const SYNODIC_DAYS = 29.53058867;
const NEW_MOON_MS = Date.UTC(2e3, 0, 6, 18, 14);
const DAY_MS = 864e5;
const PHASE_NAMES = [
  "new moon",
  "waxing crescent",
  "first quarter",
  "waxing gibbous",
  "full moon",
  "waning gibbous",
  "last quarter",
  "waning crescent"
];
function moonPhase(now) {
  const days = (now - NEW_MOON_MS) / DAY_MS;
  return (days % SYNODIC_DAYS + SYNODIC_DAYS) % SYNODIC_DAYS / SYNODIC_DAYS;
}
function phaseName(phase) {
  return PHASE_NAMES[Math.round(phase * 8) % 8];
}
function MoonWidget({ widgetProps, onWidgetPropsChange }) {
  const ref = useRef(null);
  const [label, setLabel] = useState("");
  const offset = typeof widgetProps.offsetDays === "number" ? widgetProps.offsetDays : 0;
  const setOffset = (next) => onWidgetPropsChange({ ...widgetProps, offsetDays: next });
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      const rect = cv.getBoundingClientRect();
      cv.width = Math.max(10, rect.width);
      cv.height = Math.max(10, rect.height);
      const accent = getComputedStyle(cv).getPropertyValue("--home-accent").trim() || "#d4af37";
      const phase = moonPhase(Date.now() + offset * DAY_MS);
      setLabel(`${phaseName(phase)} · ${Math.round(
        (1 - Math.cos(2 * Math.PI * phase)) / 2 * 100
      )}%`);
      const r = Math.min(cv.width, cv.height) / 2 - 6;
      const cx = cv.width / 2;
      const cy = cv.height / 2;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.fill();
      const waxing = phase < 0.5;
      const a = r * Math.cos(2 * Math.PI * phase);
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !waxing);
      ctx.ellipse(cx, cy, Math.abs(a), r, 0, Math.PI / 2, -Math.PI / 2, a > 0);
      ctx.fill();
      ctx.globalAlpha = 1;
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    const t = setInterval(draw, 36e5);
    return () => {
      ro.disconnect();
      clearInterval(t);
    };
  }, [offset]);
  const offLabel = offset === 0 ? void 0 : offset > 0 ? `+${offset}d` : `${offset}d`;
  return /* @__PURE__ */ jsxs("div", { className: "home-moon-wrap", children: [
    /* @__PURE__ */ jsx(
      HoverArrows,
      {
        onPrev: () => setOffset(offset - 1),
        onNext: () => setOffset(offset + 1),
        label: offLabel,
        onLabelClick: offset === 0 ? void 0 : () => setOffset(0)
      }
    ),
    /* @__PURE__ */ jsx("canvas", { ref, className: "home-moon-c" }),
    /* @__PURE__ */ jsx("div", { className: "home-moon-label", children: label })
  ] });
}
const SPEED_PX = 2;
const TICK_MS = 33;
const BEAT_S = 1;
const SPEEDS = [0.5, 1, 1.5, 2];
function beatY(t) {
  if (t > 0.1 && t < 0.18) return 0.12 * Math.sin((t - 0.1) / 0.08 * Math.PI);
  if (t > 0.22 && t < 0.25) return -0.12;
  if (t >= 0.25 && t < 0.29) return 1 * Math.sin((t - 0.25) / 0.04 * Math.PI);
  if (t >= 0.29 && t < 0.33) return -0.28;
  if (t > 0.42 && t < 0.54) return 0.2 * Math.sin((t - 0.42) / 0.12 * Math.PI);
  return 0;
}
function HeartbeatWidget({ status, widgetProps, onWidgetPropsChange }) {
  const ref = useRef(null);
  const online = useRef(false);
  const speedRef = useRef(1);
  useEffect(() => {
    online.current = status?.gateway_running ?? false;
  }, [status]);
  const speed = typeof widgetProps.speed === "number" ? widgetProps.speed : 1;
  speedRef.current = speed;
  const stepSpeed = (dir) => {
    const i = (SPEEDS.indexOf(speed) + dir + SPEEDS.length) % SPEEDS.length;
    onWidgetPropsChange({ ...widgetProps, speed: SPEEDS[i] });
  };
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let x = 0;
    let clock = 0;
    let prevY = null;
    let accent = "#d4af37";
    let errColor = "#e25555";
    const fit = () => {
      const rect = cv.getBoundingClientRect();
      cv.width = Math.max(10, rect.width);
      cv.height = Math.max(10, rect.height);
      const cs = getComputedStyle(cv);
      accent = cs.getPropertyValue("--home-accent").trim() || accent;
      errColor = cs.getPropertyValue("--home-error").trim() || errColor;
      x = 0;
      prevY = null;
      ctx.clearRect(0, 0, cv.width, cv.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv);
    const t = setInterval(() => {
      if (document.hidden || cv.width < 20) return;
      const mult = speedRef.current;
      const px = SPEED_PX * mult;
      clock += TICK_MS / 1e3 * mult;
      const base = cv.height * 0.62;
      const amp = cv.height * 0.42;
      const y = online.current ? base - beatY(clock % BEAT_S / BEAT_S) * amp : base;
      ctx.clearRect(x, 0, 14, cv.height);
      if (prevY !== null) {
        ctx.strokeStyle = online.current ? accent : errColor;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - px, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      prevY = y;
      x += px;
      if (x > cv.width) {
        x = 0;
        prevY = null;
      }
    }, TICK_MS);
    return () => {
      ro.disconnect();
      clearInterval(t);
    };
  }, []);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      HoverArrows,
      {
        onPrev: () => stepSpeed(-1),
        onNext: () => stepSpeed(1),
        label: `${speed}×`
      }
    ),
    /* @__PURE__ */ jsx("canvas", { ref, className: "home-canvas" })
  ] });
}
const CELL = 7;
const STEP_MS = 160;
const SEED_DENSITY = 0.22;
const RESEED_STEPS = 400;
function LifeWidget({ editing }) {
  const ref = useRef(null);
  const gridRef = useRef(new Uint8Array(0));
  const dimsRef = useRef({ cols: 0, rows: 0 });
  const stepsRef = useRef(0);
  const pausedRef = useRef(false);
  const userComposedRef = useRef(false);
  const editingRef = useRef(editing);
  const [paused, setPaused] = useState(false);
  editingRef.current = editing;
  pausedRef.current = paused;
  const seedGrid = () => {
    const { cols, rows } = dimsRef.current;
    const g = new Uint8Array(cols * rows);
    for (let i = 0; i < g.length; i++) g[i] = Math.random() < SEED_DENSITY ? 1 : 0;
    gridRef.current = g;
    stepsRef.current = 0;
    userComposedRef.current = false;
  };
  const clearGrid = () => {
    const { cols, rows } = dimsRef.current;
    gridRef.current = new Uint8Array(cols * rows);
    stepsRef.current = 0;
    userComposedRef.current = true;
  };
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let accent = "#d4af37";
    const fit = () => {
      const rect = cv.getBoundingClientRect();
      cv.width = Math.max(10, rect.width);
      cv.height = Math.max(10, rect.height);
      accent = getComputedStyle(cv).getPropertyValue("--home-accent").trim() || accent;
      dimsRef.current = {
        cols: Math.max(4, Math.floor(cv.width / CELL)),
        rows: Math.max(4, Math.floor(cv.height / CELL))
      };
      seedGrid();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv);
    const render = () => {
      const { cols, rows } = dimsRef.current;
      const g = gridRef.current;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.75;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (g[y * cols + x]) ctx.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
        }
      }
      ctx.globalAlpha = 1;
    };
    const t = setInterval(() => {
      if (document.hidden) return;
      const g = gridRef.current;
      if (g.length === 0) return;
      const { cols, rows } = dimsRef.current;
      if (!pausedRef.current) {
        const next = new Uint8Array(g.length);
        let alive = 0;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            let n = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const yy = (y + dy + rows) % rows;
                const xx = (x + dx + cols) % cols;
                n += g[yy * cols + xx];
              }
            }
            const i = y * cols + x;
            next[i] = g[i] ? n === 2 || n === 3 ? 1 : 0 : n === 3 ? 1 : 0;
            alive += next[i];
          }
        }
        gridRef.current = next;
        stepsRef.current++;
        if (!userComposedRef.current && (alive === 0 || alive < next.length * 0.02 || stepsRef.current > RESEED_STEPS)) seedGrid();
      }
      render();
    }, STEP_MS);
    let drawing = false;
    const paint = (e) => {
      const { cols, rows } = dimsRef.current;
      const rect = cv.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / CELL);
      const y = Math.floor((e.clientY - rect.top) / CELL);
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      gridRef.current[y * cols + x] = 1;
      userComposedRef.current = true;
      render();
    };
    const onDown = (e) => {
      if (editingRef.current) return;
      drawing = true;
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
      }
      paint(e);
    };
    const onMove = (e) => {
      if (drawing) paint(e);
    };
    const onUp = (e) => {
      drawing = false;
      try {
        cv.releasePointerCapture(e.pointerId);
      } catch {
      }
    };
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    return () => {
      ro.disconnect();
      clearInterval(t);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
    };
  }, []);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(HoverCtl, { children: [
      /* @__PURE__ */ jsx("button", { className: "hv-opt", onClick: () => setPaused((p) => !p), children: paused ? "play" : "pause" }),
      /* @__PURE__ */ jsx("button", { className: "hv-opt", onClick: seedGrid, children: "seed" }),
      /* @__PURE__ */ jsx("button", { className: "hv-opt", onClick: clearGrid, children: "clear" })
    ] }),
    /* @__PURE__ */ jsx("canvas", { ref, className: "home-canvas home-life" })
  ] });
}
function readState(p) {
  const s = p.pomodoro;
  const workMin = typeof s?.workMin === "number" ? s.workMin : 25;
  const breakMin = typeof s?.breakMin === "number" ? s.breakMin : 5;
  if (s && (s.mode === "work" || s.mode === "break")) {
    return {
      mode: s.mode,
      endsAt: typeof s.endsAt === "number" ? s.endsAt : null,
      remaining: typeof s.remaining === "number" ? s.remaining : workMin * 60,
      workMin,
      breakMin
    };
  }
  return { mode: "work", endsAt: null, remaining: workMin * 60, workMin, breakMin };
}
const clampMin = (n) => Math.max(1, Math.min(180, Math.round(n)));
function PomodoroWidget({ widgetProps, onWidgetPropsChange }) {
  const state = readState(widgetProps);
  const label = typeof widgetProps.label === "string" ? widgetProps.label : "";
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const commit = (next) => onWidgetPropsChange({ ...widgetProps, pomodoro: next });
  const secondsLeft = state.endsAt !== null ? Math.max(0, Math.round((state.endsAt - now) / 1e3)) : state.remaining;
  const running = state.endsAt !== null;
  useEffect(() => {
    if (state.endsAt === null) return;
    const t = setInterval(() => {
      if (state.endsAt !== null && state.endsAt - Date.now() <= 0) {
        const mode = state.mode === "work" ? "break" : "work";
        const remaining = (mode === "work" ? state.workMin : state.breakMin) * 60;
        commit({ ...state, mode, endsAt: null, remaining });
      } else {
        setNow(Date.now());
      }
    }, 1e3);
    return () => clearInterval(t);
  }, [state.endsAt, state.mode]);
  const toggle = () => {
    setNow(Date.now());
    if (state.endsAt === null) {
      commit({ ...state, endsAt: Date.now() + state.remaining * 1e3 });
    } else {
      commit({ ...state, endsAt: null, remaining: secondsLeft });
    }
  };
  const setWork = (n) => commit({ ...state, workMin: clampMin(n), mode: "work", endsAt: null, remaining: clampMin(n) * 60 });
  const setBreak = (n) => commit({ ...state, breakMin: clampMin(n) });
  const saveName = (value) => {
    setEditing(false);
    onWidgetPropsChange({ ...widgetProps, label: value.trim() });
  };
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  return /* @__PURE__ */ jsxs("div", { className: "home-clock-wrap home-pomo", children: [
    /* @__PURE__ */ jsxs(HoverCtl, { className: "pomo-set", children: [
      /* @__PURE__ */ jsxs("div", { className: "pomo-stepper", children: [
        /* @__PURE__ */ jsx("span", { className: "hv-label", children: "work" }),
        /* @__PURE__ */ jsx("button", { className: "hv-arrow", disabled: running, onClick: () => setWork(state.workMin - 1), children: "‹" }),
        /* @__PURE__ */ jsx("span", { className: "hv-label", children: state.workMin }),
        /* @__PURE__ */ jsx("button", { className: "hv-arrow", disabled: running, onClick: () => setWork(state.workMin + 1), children: "›" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "pomo-stepper", children: [
        /* @__PURE__ */ jsx("span", { className: "hv-label", children: "break" }),
        /* @__PURE__ */ jsx("button", { className: "hv-arrow", onClick: () => setBreak(state.breakMin - 1), children: "‹" }),
        /* @__PURE__ */ jsx("span", { className: "hv-label", children: state.breakMin }),
        /* @__PURE__ */ jsx("button", { className: "hv-arrow", onClick: () => setBreak(state.breakMin + 1), children: "›" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: `home-clock${running ? "" : " paused"}`,
        onClick: toggle,
        title: "click: start / pause",
        children: [
          mm,
          ":",
          ss
        ]
      }
    ),
    editing ? /* @__PURE__ */ jsx(
      "input",
      {
        className: "note-input count-input",
        autoFocus: true,
        defaultValue: label,
        onBlur: (e) => saveName(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") saveName(e.currentTarget.value);
          if (e.key === "Escape") setEditing(false);
        }
      }
    ) : /* @__PURE__ */ jsxs(
      "div",
      {
        className: "home-clock-sub pomo-sub",
        onClick: () => setEditing(true),
        title: "click to name this timer",
        children: [
          label ? `${label} · ` : "",
          state.mode,
          " ",
          running ? "· running" : "· paused"
        ]
      }
    )
  ] });
}
const pad = (n) => String(n).padStart(2, "0");
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const buildISO = (s) => `${s.y}-${pad(s.mo + 1)}-${pad(s.d)}T${pad(s.h)}:${pad(s.mi)}`;
const fromDate = (dt) => ({ y: dt.getFullYear(), mo: dt.getMonth(), d: dt.getDate(), h: dt.getHours(), mi: dt.getMinutes() });
const daysIn = (y, mo) => new Date(y, mo + 1, 0).getDate();
function parseTargetMs(target) {
  if (!target) return NaN;
  return new Date(target.length === 10 ? `${target}T00:00:00` : target).getTime();
}
function parseSeg(target) {
  const ms = parseTargetMs(target);
  return Number.isNaN(ms) ? null : fromDate(new Date(ms));
}
function NumSeg({
  value,
  width,
  label,
  onStep,
  onCommit
}) {
  const [buf, setBuf] = useState(null);
  return /* @__PURE__ */ jsxs("div", { className: "count-seg", onWheel: (e) => {
    e.preventDefault();
    onStep(e.deltaY < 0 ? 1 : -1);
  }, children: [
    /* @__PURE__ */ jsx("button", { className: "seg-btn", tabIndex: -1, "aria-label": `${label} up`, onClick: () => {
      setBuf(null);
      onStep(1);
    }, children: "▲" }),
    /* @__PURE__ */ jsx(
      "input",
      {
        className: "seg-val",
        style: { width },
        value: buf ?? pad(value),
        inputMode: "numeric",
        "aria-label": label,
        onChange: (e) => setBuf(e.target.value.replace(/[^0-9]/g, "")),
        onBlur: () => {
          if (buf !== null) {
            const n = parseInt(buf, 10);
            if (!Number.isNaN(n)) onCommit(n);
            setBuf(null);
          }
        },
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === "Escape") e.target.blur();
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setBuf(null);
            onStep(1);
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setBuf(null);
            onStep(-1);
          }
        }
      }
    ),
    /* @__PURE__ */ jsx("button", { className: "seg-btn", tabIndex: -1, "aria-label": `${label} down`, onClick: () => {
      setBuf(null);
      onStep(-1);
    }, children: "▼" })
  ] });
}
function MonSeg({ value, onStep }) {
  return /* @__PURE__ */ jsxs("div", { className: "count-seg", onWheel: (e) => {
    e.preventDefault();
    onStep(e.deltaY < 0 ? 1 : -1);
  }, children: [
    /* @__PURE__ */ jsx("button", { className: "seg-btn", tabIndex: -1, "aria-label": "month up", onClick: () => onStep(1), children: "▲" }),
    /* @__PURE__ */ jsx("div", { className: "seg-val seg-static", style: { width: 36 }, children: MONTHS[value] }),
    /* @__PURE__ */ jsx("button", { className: "seg-btn", tabIndex: -1, "aria-label": "month down", onClick: () => onStep(-1), children: "▼" })
  ] });
}
function CountdownWidget({ widgetProps, onWidgetPropsChange }) {
  const label = typeof widgetProps.label === "string" ? widgetProps.label : "";
  const target = typeof widgetProps.target === "string" ? widgetProps.target : "";
  const [mode, setMode] = useState("none");
  const [seg, setSeg] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 3e4);
    return () => clearInterval(t);
  }, []);
  const targetMs = parseTargetMs(target);
  const commitSeg = (s) => {
    setSeg(s);
    onWidgetPropsChange({ ...widgetProps, target: buildISO(s) });
  };
  const openDatetime = () => {
    setSeg(parseSeg(target) ?? fromDate(/* @__PURE__ */ new Date()));
    setMode("datetime");
  };
  const stepField = (field, delta) => {
    if (!seg) return;
    if (field === "year") {
      const y = seg.y + delta;
      commitSeg({ ...seg, y, d: Math.min(seg.d, daysIn(y, seg.mo)) });
    } else if (field === "month") {
      const mo = (seg.mo + delta + 12) % 12;
      commitSeg({ ...seg, mo, d: Math.min(seg.d, daysIn(seg.y, mo)) });
    } else {
      const dt = new Date(seg.y, seg.mo, seg.d, seg.h, seg.mi);
      if (field === "day") dt.setDate(dt.getDate() + delta);
      if (field === "hour") dt.setHours(dt.getHours() + delta);
      if (field === "min") dt.setMinutes(dt.getMinutes() + delta);
      commitSeg(fromDate(dt));
    }
  };
  const commitField = (field, n) => {
    if (!seg) return;
    if (field === "year") {
      const y = Math.min(2200, Math.max(1970, n));
      commitSeg({ ...seg, y, d: Math.min(seg.d, daysIn(y, seg.mo)) });
    } else if (field === "day") {
      commitSeg({ ...seg, d: Math.min(daysIn(seg.y, seg.mo), Math.max(1, n)) });
    } else if (field === "hour") {
      commitSeg({ ...seg, h: Math.min(23, Math.max(0, n)) });
    } else {
      commitSeg({ ...seg, mi: Math.min(59, Math.max(0, n)) });
    }
  };
  const shiftDays = (delta) => {
    const base = !Number.isNaN(targetMs) ? new Date(targetMs) : /* @__PURE__ */ new Date();
    base.setDate(base.getDate() + delta);
    onWidgetPropsChange({ ...widgetProps, target: buildISO(fromDate(base)) });
  };
  const saveLabel = (value) => {
    setMode("none");
    onWidgetPropsChange({ ...widgetProps, label: value.trim() });
  };
  if (mode === "datetime" && seg) {
    return /* @__PURE__ */ jsx("div", { className: "home-clock-wrap home-count", children: /* @__PURE__ */ jsxs("div", { className: "count-edit", children: [
      /* @__PURE__ */ jsxs("div", { className: "count-edit-row", children: [
        /* @__PURE__ */ jsx(MonSeg, { value: seg.mo, onStep: (d) => stepField("month", d) }),
        /* @__PURE__ */ jsx(
          NumSeg,
          {
            value: seg.d,
            width: 22,
            label: "day",
            onStep: (d) => stepField("day", d),
            onCommit: (n) => commitField("day", n)
          }
        ),
        /* @__PURE__ */ jsx(
          NumSeg,
          {
            value: seg.y,
            width: 42,
            label: "year",
            onStep: (d) => stepField("year", d),
            onCommit: (n) => commitField("year", n)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "count-edit-row", children: [
        /* @__PURE__ */ jsx(
          NumSeg,
          {
            value: seg.h,
            width: 22,
            label: "hour",
            onStep: (d) => stepField("hour", d),
            onCommit: (n) => commitField("hour", n)
          }
        ),
        /* @__PURE__ */ jsx("span", { className: "count-colon", children: ":" }),
        /* @__PURE__ */ jsx(
          NumSeg,
          {
            value: seg.mi,
            width: 22,
            label: "minute",
            onStep: (d) => stepField("min", d),
            onCommit: (n) => commitField("min", n)
          }
        )
      ] }),
      /* @__PURE__ */ jsx("button", { className: "count-done", onClick: () => {
        setMode("none");
        setSeg(null);
      }, children: "done" })
    ] }) });
  }
  let big = "—";
  if (!Number.isNaN(targetMs)) {
    const diff = targetMs - now;
    const abs = Math.abs(diff);
    const d = Math.floor(abs / 864e5);
    const h = Math.floor(abs % 864e5 / 36e5);
    const m = Math.floor(abs % 36e5 / 6e4);
    big = `${diff < 0 ? "+" : ""}${d > 0 ? `${d}d ` : ""}${pad(h)}:${pad(m)}`;
  }
  const dateLabel = !Number.isNaN(targetMs) ? new Date(targetMs).toLocaleDateString(void 0, { month: "short", day: "numeric" }) : "set date";
  return /* @__PURE__ */ jsxs("div", { className: "home-clock-wrap home-count", children: [
    /* @__PURE__ */ jsx(HoverArrows, { onPrev: () => shiftDays(-1), onNext: () => shiftDays(1), label: dateLabel }),
    /* @__PURE__ */ jsx(
      "div",
      {
        className: "home-clock count-big",
        onClick: openDatetime,
        title: "click to set the date & time",
        children: big
      }
    ),
    mode === "label" ? /* @__PURE__ */ jsx(
      "input",
      {
        className: "note-input count-input",
        autoFocus: true,
        defaultValue: label,
        onBlur: (e) => saveLabel(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") saveLabel(e.currentTarget.value);
          if (e.key === "Escape") setMode("none");
        }
      }
    ) : /* @__PURE__ */ jsx(
      "div",
      {
        className: "home-clock-sub count-label",
        onClick: () => setMode("label"),
        title: "click to edit the label",
        children: label || "click to name this countdown"
      }
    )
  ] });
}
function CalendarWidget({ gridSize }) {
  const [now, setNow] = useState(() => /* @__PURE__ */ new Date());
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(/* @__PURE__ */ new Date()), 6e4);
    return () => clearInterval(t);
  }, []);
  const view = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = view.getFullYear();
  const month = view.getMonth();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const today = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstCol = (new Date(year, month, 1).getDay() + 6) % 7;
  const monthLabel = view.toLocaleDateString(void 0, { month: "long", year: "numeric" });
  const dayLetters = Array.from(
    { length: 7 },
    (_, i) => new Date(2024, 0, i + 1).toLocaleDateString(void 0, { weekday: "narrow" })
  );
  const tier = gridSize.gw <= 2 ? "mini" : gridSize.gw >= 4 ? "large" : "normal";
  return /* @__PURE__ */ jsxs("div", { className: `home-cal tier-${tier}`, children: [
    /* @__PURE__ */ jsx(
      HoverArrows,
      {
        onPrev: () => setOffset(offset - 1),
        onNext: () => setOffset(offset + 1),
        label: offset === 0 ? void 0 : "today",
        onLabelClick: offset === 0 ? void 0 : () => setOffset(0)
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "home-cal-month", children: monthLabel }),
    /* @__PURE__ */ jsxs("div", { className: "home-cal-grid", children: [
      tier !== "mini" && dayLetters.map((l, i) => /* @__PURE__ */ jsx("span", { className: "home-cal-h", children: l }, `h${i}`)),
      Array.from({ length: firstCol }, (_, i) => /* @__PURE__ */ jsx("span", {}, `p${i}`)),
      Array.from({ length: daysInMonth }, (_, i) => /* @__PURE__ */ jsx(
        "span",
        {
          className: isCurrentMonth && i + 1 === today ? "home-cal-today" : "home-cal-d",
          children: i + 1
        },
        i + 1
      ))
    ] })
  ] });
}
let active = false;
const listeners$1 = /* @__PURE__ */ new Set();
function enterTheater() {
  if (active) return;
  active = true;
  listeners$1.forEach((l) => l(true));
}
function exitTheater() {
  if (!active) return;
  active = false;
  listeners$1.forEach((l) => l(false));
}
function subscribeTheater(listener) {
  listeners$1.add(listener);
  return () => listeners$1.delete(listener);
}
const EMPTY_LIVE = {
  live: false,
  busy: false,
  currentTool: null,
  toolHistory: [],
  streamText: "",
  lastMessage: null,
  feed: [],
  subagents: [],
  activeSessionId: null,
  activeTitle: null,
  lastEventAt: null
};
const MAX_TOOL_HISTORY = 12;
const MAX_FEED = 80;
let liveState = EMPTY_LIVE;
const listeners = /* @__PURE__ */ new Set();
let subscribed = false;
let feedSeq = 0;
function setLive(fn) {
  const next = fn(liveState);
  if (next === liveState) return;
  liveState = next;
  listeners.forEach((l) => l());
}
function pushFeed(entry) {
  setLive((s) => {
    const e = { ...entry, id: ++feedSeq };
    const feed = [e, ...s.feed];
    return { ...s, feed: feed.length > MAX_FEED ? feed.slice(0, MAX_FEED) : feed };
  });
}
function str(v) {
  return typeof v === "string" && v.length > 0 ? v : void 0;
}
function asObj(v) {
  return typeof v === "object" && v !== null ? v : void 0;
}
function pick(p, ...keys) {
  if (!p) return void 0;
  for (const k of keys) {
    const v = str(p[k]);
    if (v) return v;
  }
  return void 0;
}
function argPreview(args, max = 160) {
  if (args === void 0 || args === null) return void 0;
  let s;
  if (typeof args === "string") s = args;
  else {
    try {
      s = JSON.stringify(args);
    } catch {
      s = String(args);
    }
  }
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}
function handleEvent(event) {
  const { type, payload } = event;
  const p = asObj(payload);
  const now = Date.now();
  const bump = (s) => ({ ...s, lastEventAt: now });
  if (type === "tool.generating") {
    const name = pick(p, "name") ?? "tool";
    setLive((s) => bump({
      ...s,
      busy: true,
      currentTool: { name, startedAt: now, status: "running" }
    }));
    pushFeed({ at: now, kind: "tool", label: name, detail: "generating…" });
    return;
  }
  if (type === "tool.start" || type === "tool.progress") {
    const name = pick(p, "name", "tool_name") ?? "tool";
    setLive((s) => bump({
      ...s,
      busy: true,
      currentTool: { name, args: p?.args ?? p, startedAt: now, status: "running" }
    }));
    pushFeed({
      at: now,
      kind: "tool",
      label: name,
      detail: type === "tool.progress" ? "progress…" : argPreview(p?.args)
    });
    return;
  }
  if (type === "tool.complete") {
    const name = pick(p, "name", "tool_name") ?? "";
    const ok = p?.ok !== false && !str(p?.error);
    const duration = typeof p?.duration === "number" ? p.duration : void 0;
    setLive((s) => bump({
      ...s,
      currentTool: null,
      busy: s.subagents.some((a) => a.status === "running") || s.streamText.length > 0,
      toolHistory: [{
        name: name || s.currentTool?.name || "tool",
        args: p?.args ?? s.currentTool?.args,
        startedAt: s.currentTool?.startedAt ?? now,
        status: ok ? "complete" : "failed",
        duration
      }, ...s.toolHistory].slice(0, MAX_TOOL_HISTORY)
    }));
    pushFeed({
      at: now,
      kind: "tool",
      label: name || "tool",
      ok,
      detail: duration !== void 0 ? `${duration.toFixed(1)}s` : void 0
    });
    return;
  }
  if (type === "message.start") {
    setLive((s) => bump({ ...s, busy: true, streamText: "" }));
    return;
  }
  if (type === "message.delta") {
    const text = pick(p, "text", "delta", "content");
    if (!text) return;
    setLive((s) => bump({
      ...s,
      busy: true,
      streamText: (s.streamText + text).slice(-6e3)
    }));
    return;
  }
  if (type === "message.interim") {
    const text = pick(p, "text", "content");
    if (!text) return;
    setLive((s) => bump({ ...s, lastMessage: text }));
    return;
  }
  if (type === "message.complete") {
    setLive((s) => {
      const done = s.streamText.trim();
      return bump({
        ...s,
        streamText: "",
        lastMessage: done.length > 0 ? done : s.lastMessage,
        busy: s.currentTool !== null || s.subagents.some((a) => a.status === "running")
      });
    });
    return;
  }
  if (type === "subagent.start" || type === "subagent.progress") {
    const name = pick(p, "name", "role", "id") ?? "subagent";
    setLive((s) => bump({
      ...s,
      busy: true,
      subagents: [
        { name, status: "running", goal: pick(p, "goal", "task") },
        ...s.subagents.filter((a) => a.name !== name)
      ].slice(0, 6)
    }));
    pushFeed({ at: now, kind: "subagent", label: name, detail: "spawned" });
    return;
  }
  if (type === "subagent.complete") {
    const name = pick(p, "name", "role", "id");
    if (!name) return;
    setLive((s) => bump({
      ...s,
      subagents: s.subagents.map((a) => a.name === name ? { ...a, status: "done" } : a)
    }));
    pushFeed({ at: now, kind: "subagent", label: name, ok: true, detail: "done" });
    return;
  }
  if (type === "subagent.thinking") {
    const name = pick(p, "name", "role", "id") ?? "subagent";
    pushFeed({ at: now, kind: "subagent", label: name, detail: "thinking…" });
    setLive(bump);
    return;
  }
  if (type === "session.new" || type === "session.info") {
    const sid = pick(p, "session_id", "id") ?? event.session_id;
    if (!sid) return;
    setLive((s) => bump({
      ...s,
      activeSessionId: sid,
      activeTitle: pick(p, "title") ?? s.activeTitle
    }));
    pushFeed({ at: now, kind: "session", label: "session", detail: "new" });
    return;
  }
  if (type === "session.title") {
    const title = pick(p, "title");
    if (!title) return;
    setLive((s) => bump({ ...s, activeTitle: title }));
    return;
  }
  if (type === "session.status") {
    const sid = pick(p, "session_id", "id") ?? event.session_id;
    const status = pick(p, "status");
    if (status === "stopped" || status === "idle") {
      setLive((s) => s.busy ? bump({ ...s, busy: false }) : s);
    }
    if (sid) setLive((s) => bump({ ...s, activeSessionId: sid }));
    return;
  }
  if (type === "error") {
    pushFeed({
      at: now,
      kind: "system",
      label: "error",
      detail: pick(p, "error", "message")
    });
    setLive(bump);
    return;
  }
  if (type.startsWith("tool.") || type.startsWith("message.") || type.startsWith("subagent.") || type.startsWith("session.") || type.startsWith("thinking.") || type.startsWith("reasoning.") || type.startsWith("approval.") || type.startsWith("run.")) {
    pushFeed({ at: now, kind: "system", label: type });
    setLive(bump);
  }
}
function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  const all = onGatewayEvent("*", handleEvent);
  if (all) {
    setLive((s) => s.live ? s : { ...s, live: true });
    pushFeed({ at: Date.now(), kind: "system", label: "live", detail: "gateway channel open" });
  }
}
function useAgentLive() {
  const [state, setState] = useState(liveState);
  useEffect(() => {
    ensureSubscribed();
    setState(liveState);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  function onChange() {
    setState(liveState);
  }
  return state;
}
function renderInline(text, keyBase) {
  const nodes = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let i = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      nodes.push(/* @__PURE__ */ jsx("strong", { children: tok.slice(2, -2) }, `${keyBase}-b${i}`));
    } else if (tok.startsWith("`")) {
      nodes.push(/* @__PURE__ */ jsx("code", { children: tok.slice(1, -1) }, `${keyBase}-c${i}`));
    } else {
      nodes.push(/* @__PURE__ */ jsx("em", { children: tok.slice(1, -1) }, `${keyBase}-i${i}`));
    }
    last = m.index + tok.length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
function MarkdownText({ text }) {
  const lines = text.split("\n");
  const out = [];
  const codeBuf = [];
  let inCode = false;
  const listItems = [];
  const flushList = (key) => {
    if (listItems.length === 0) return;
    out.push(
      /* @__PURE__ */ jsx("div", { className: "home-md-list", children: listItems }, key)
    );
    listItems.length = 0;
  };
  lines.forEach((line, idx) => {
    const key = `l${idx}`;
    if (line.trimStart().startsWith("```")) {
      if (inCode) {
        out.push(
          /* @__PURE__ */ jsx("pre", { className: "home-md-pre", children: /* @__PURE__ */ jsx("code", { children: codeBuf.join("\n") }) }, key)
        );
        codeBuf.length = 0;
        inCode = false;
      } else {
        flushList(key);
        inCode = true;
      }
      return;
    }
    if (inCode) {
      codeBuf.push(line);
      return;
    }
    const t = line.trim();
    if (!t) {
      flushList(key);
      out.push(/* @__PURE__ */ jsx("div", { className: "home-md-gap" }, key));
      return;
    }
    const heading = t.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushList(key);
      out.push(
        /* @__PURE__ */ jsx("div", { className: `home-md-h h${heading[1].length}`, children: renderInline(heading[2], key) }, key)
      );
      return;
    }
    const item = t.match(/^[-*]\s+(.*)$/);
    if (item) {
      listItems.push(/* @__PURE__ */ jsx("div", { className: "home-md-li", children: renderInline(item[1], key) }, key));
      return;
    }
    flushList(key);
    out.push(/* @__PURE__ */ jsx("div", { className: "home-md-p", children: renderInline(t, key) }, key));
  });
  if (inCode) {
    out.push(
      /* @__PURE__ */ jsx("pre", { className: "home-md-pre", children: /* @__PURE__ */ jsx("code", { children: codeBuf.join("\n") }) }, "open-fence")
    );
  }
  flushList("list-end");
  return /* @__PURE__ */ jsx(Fragment, { children: out });
}
function useScene(live) {
  const [scene, setScene] = useState(() => sceneFrom(live));
  const wasStreaming = useRef(false);
  useEffect(() => {
    const streaming = live.streamText.trim().length > 0;
    const prevStreaming = wasStreaming.current;
    wasStreaming.current = streaming;
    if (live.currentTool) {
      const key = `tool-${live.currentTool.name}-${live.currentTool.startedAt}`;
      const body = argPreview(live.currentTool.args, 800) ?? "";
      setScene(
        (s) => s.key === key ? { ...s, body } : {
          key,
          kind: "tool",
          title: live.currentTool.name,
          body,
          meta: "running"
        }
      );
      return;
    }
    if (streaming && !prevStreaming) {
      setScene({
        key: `msg-${Date.now()}`,
        kind: "message",
        title: "message",
        body: live.streamText,
        meta: "streaming",
        streaming: true
      });
    } else if (streaming) {
      setScene((s) => s.streaming ? { ...s, body: live.streamText } : s);
    } else if (live.lastMessage) {
      const msg = live.lastMessage;
      setScene(
        (s) => s.kind === "message" && !s.streaming && s.body === msg ? s : { key: `done-${Date.now()}`, kind: "message", title: "message", body: msg, meta: "complete" }
      );
    } else {
      setScene(
        (s) => s.kind === "idle" ? s : { key: "idle", kind: "idle", title: "idle", body: "the agent is resting — new activity will appear here" }
      );
    }
  }, [live.streamText, live.currentTool, live.lastMessage]);
  return scene;
}
function sceneFrom(live) {
  if (live.streamText.trim()) {
    return {
      key: `msg-${Date.now()}`,
      kind: "message",
      title: "message",
      body: live.streamText,
      meta: "streaming",
      streaming: true
    };
  }
  if (live.currentTool) {
    return {
      key: `tool-${live.currentTool.name}-${live.currentTool.startedAt}`,
      kind: "tool",
      title: live.currentTool.name,
      body: argPreview(live.currentTool.args, 500) ?? "",
      meta: "running"
    };
  }
  if (live.lastMessage) {
    return { key: "done", kind: "message", title: "message", body: live.lastMessage, meta: "complete" };
  }
  return { key: "idle", kind: "idle", title: "idle", body: "the agent is resting — new activity will appear here" };
}
function SceneBody({ scene }) {
  if (scene.kind === "tool") {
    return /* @__PURE__ */ jsxs("div", { className: "home-scene-tool", children: [
      /* @__PURE__ */ jsx("span", { className: "home-scene-title", children: scene.title }),
      /* @__PURE__ */ jsx("span", { className: "home-scene-meta", children: scene.meta }),
      scene.body && /* @__PURE__ */ jsx("pre", { className: "home-scene-args", children: scene.body })
    ] });
  }
  if (scene.kind === "message") {
    return /* @__PURE__ */ jsxs("div", { className: "home-scene-msg", children: [
      /* @__PURE__ */ jsx(MarkdownText, { text: scene.body }),
      scene.streaming && /* @__PURE__ */ jsx("span", { className: "home-scene-caret", "aria-hidden": "true" })
    ] });
  }
  return /* @__PURE__ */ jsx("div", { className: "home-scene-idle", children: scene.body });
}
function LiveScene({ scene }) {
  const [current, setCurrent] = useState(scene);
  const [leaving, setLeaving] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    if (scene.key === current.key) return;
    setLeaving(current);
    setCurrent(scene);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLeaving(null), 460);
  }, [scene.key]);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "home-scene", children: [
    leaving && /* @__PURE__ */ jsx("div", { className: "home-scene-item leaving", "aria-hidden": "true", children: /* @__PURE__ */ jsx(SceneBody, { scene: leaving }) }),
    /* @__PURE__ */ jsx("div", { className: "home-scene-item", children: /* @__PURE__ */ jsx(SceneBody, { scene: current }) }, current.key)
  ] });
}
function fmtCost$1(n) {
  if (n === void 0 || !Number.isFinite(n)) return "—";
  if (n < 0.01) return `$${(n * 1e3).toFixed(2)}m`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
function fmtTok$1(n) {
  if (n === void 0 || !Number.isFinite(n)) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}
function AgentWidget({ data }) {
  const live = useAgentLive();
  const scene = useScene(live);
  const totals = data.analytics?.totals;
  const statusLabel = live.busy ? live.currentTool ? "working" : "thinking" : "idle";
  return /* @__PURE__ */ jsxs("div", { className: "home-agent", children: [
    /* @__PURE__ */ jsxs("div", { className: "home-agent-head", children: [
      /* @__PURE__ */ jsx("span", { className: `home-agent-dot ${live.busy ? "busy" : ""}`, "aria-hidden": "true" }),
      /* @__PURE__ */ jsx("span", { className: "home-agent-status", children: statusLabel })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "home-agent-scene", children: /* @__PURE__ */ jsx(LiveScene, { scene }) }),
    /* @__PURE__ */ jsx(HoverCtl, { className: "home-agent-ctl", children: /* @__PURE__ */ jsxs(
      "button",
      {
        className: "home-agent-take",
        onClick: () => enterTheater(),
        title: "Take control of the screen — live agent theater",
        "aria-label": "Take control",
        children: [
          /* @__PURE__ */ jsx("span", { className: "home-agent-take-ico", "aria-hidden": "true" }),
          "take control"
        ]
      }
    ) }),
    /* @__PURE__ */ jsxs("div", { className: "home-agent-stats", children: [
      /* @__PURE__ */ jsxs("span", { title: "Input tokens today", children: [
        /* @__PURE__ */ jsx("i", { children: "in" }),
        " ",
        fmtTok$1(totals?.total_input)
      ] }),
      /* @__PURE__ */ jsxs("span", { title: "Output tokens today", children: [
        /* @__PURE__ */ jsx("i", { children: "out" }),
        " ",
        fmtTok$1(totals?.total_output)
      ] }),
      /* @__PURE__ */ jsxs("span", { title: "Estimated cost today", children: [
        /* @__PURE__ */ jsx("i", { children: "est" }),
        " ",
        fmtCost$1(totals?.total_estimated_cost)
      ] }),
      /* @__PURE__ */ jsxs("span", { title: "Sessions today", children: [
        /* @__PURE__ */ jsx("i", { children: "ses" }),
        " ",
        totals?.total_sessions ?? "—"
      ] })
    ] }),
    live.toolHistory.length > 0 && /* @__PURE__ */ jsx("div", { className: "home-agent-history", children: live.toolHistory.slice(0, 4).map((t, i) => /* @__PURE__ */ jsxs("span", { className: "home-agent-hist", children: [
      /* @__PURE__ */ jsx(
        "span",
        {
          className: `home-agent-hist-dot ${t.status === "complete" ? "ok" : "bad"}`,
          "aria-hidden": "true"
        }
      ),
      t.name,
      t.duration !== void 0 && /* @__PURE__ */ jsxs("i", { children: [
        t.duration.toFixed(0),
        "s"
      ] })
    ] }, `${t.name}-${t.startedAt}-${i}`)) }),
    !live.live && /* @__PURE__ */ jsx("div", { className: "home-agent-dim", children: "polling mode · no live channel" })
  ] });
}
const WIDGET_REGISTRY = {
  ascii: {
    title: "hermes",
    component: ({ data, widgetProps, onWidgetPropsChange }) => /* @__PURE__ */ jsx(
      AsciiWidget,
      {
        status: data.status,
        widgetProps,
        onWidgetPropsChange
      }
    ),
    defaultSize: { gw: 3, gh: 6 },
    minSize: { gw: 2, gh: 4 },
    navigateTo: null,
    dataSource: null
  },
  clock: {
    title: "clock",
    component: ({ widgetProps, onWidgetPropsChange }) => /* @__PURE__ */ jsx(ClockWidget, { widgetProps, onWidgetPropsChange }),
    defaultSize: { gw: 5, gh: 3 },
    minSize: { gw: 2, gh: 2 },
    navigateTo: null,
    dataSource: null
  },
  matrix: {
    title: "matrix",
    component: ({ widgetProps, onWidgetPropsChange }) => /* @__PURE__ */ jsx(MatrixWidget, { widgetProps, onWidgetPropsChange }),
    defaultSize: { gw: 3, gh: 4 },
    minSize: { gw: 2, gh: 2 },
    navigateTo: null,
    dataSource: null
  },
  gateway: {
    title: "gateway",
    component: ({ data }) => /* @__PURE__ */ jsx(GatewayWidget, { status: data.status }),
    defaultSize: { gw: 4, gh: 3 },
    minSize: { gw: 3, gh: 2 },
    navigateTo: "/system",
    dataSource: "status"
  },
  sessions: {
    title: "sessions",
    component: ({ data }) => /* @__PURE__ */ jsx(SessionsWidget, { status: data.status, sessions: data.sessions }),
    defaultSize: { gw: 3, gh: 3 },
    minSize: { gw: 2, gh: 2 },
    navigateTo: "/sessions",
    dataSource: "sessions"
  },
  tokens: {
    title: "tokens",
    component: ({ data, widgetProps, onWidgetPropsChange }) => /* @__PURE__ */ jsx(
      TokensWidget,
      {
        analytics: data.analytics,
        widgetProps,
        onWidgetPropsChange
      }
    ),
    defaultSize: { gw: 5, gh: 4 },
    minSize: { gw: 3, gh: 3 },
    navigateTo: null,
    dataSource: "analytics"
  },
  host: {
    title: "host",
    component: ({ data, widgetProps, onWidgetPropsChange }) => /* @__PURE__ */ jsx(
      HostWidget,
      {
        system: data.system,
        widgetProps,
        onWidgetPropsChange
      }
    ),
    defaultSize: { gw: 4, gh: 4 },
    minSize: { gw: 3, gh: 3 },
    navigateTo: "/system",
    dataSource: "system"
  },
  cron: {
    title: "cron",
    component: ({ data }) => /* @__PURE__ */ jsx(CronWidget, { cron: data.cron }),
    defaultSize: { gw: 3, gh: 3 },
    minSize: { gw: 3, gh: 2 },
    navigateTo: "/cron",
    dataSource: "cron"
  },
  notes: {
    title: "notes",
    component: ({ widgetProps, onWidgetPropsChange }) => /* @__PURE__ */ jsx(NotesWidget, { widgetProps, onWidgetPropsChange }),
    defaultSize: { gw: 3, gh: 4 },
    minSize: { gw: 2, gh: 2 },
    navigateTo: null,
    dataSource: null
  },
  errors: {
    title: "Logs",
    component: ({ data, widgetProps, onWidgetPropsChange }) => /* @__PURE__ */ jsx(
      ErrorsWidget,
      {
        logs: data.logs,
        widgetProps,
        onWidgetPropsChange
      }
    ),
    defaultSize: { gw: 3, gh: 3 },
    minSize: { gw: 2, gh: 2 },
    navigateTo: "/logs",
    dataSource: "logs"
  },
  moon: {
    title: "moon",
    component: ({ widgetProps, onWidgetPropsChange }) => /* @__PURE__ */ jsx(MoonWidget, { widgetProps, onWidgetPropsChange }),
    defaultSize: { gw: 2, gh: 3 },
    minSize: { gw: 2, gh: 2 },
    navigateTo: null,
    dataSource: null
  },
  heartbeat: {
    title: "heartbeat",
    component: ({ data, widgetProps, onWidgetPropsChange }) => /* @__PURE__ */ jsx(
      HeartbeatWidget,
      {
        status: data.status,
        widgetProps,
        onWidgetPropsChange
      }
    ),
    defaultSize: { gw: 4, gh: 2 },
    minSize: { gw: 2, gh: 2 },
    navigateTo: null,
    dataSource: null
  },
  life: {
    title: "life",
    component: ({ editing }) => /* @__PURE__ */ jsx(LifeWidget, { editing }),
    defaultSize: { gw: 3, gh: 3 },
    minSize: { gw: 2, gh: 2 },
    navigateTo: null,
    dataSource: null
  },
  pomodoro: {
    title: "pomodoro",
    component: ({ widgetProps, onWidgetPropsChange }) => /* @__PURE__ */ jsx(PomodoroWidget, { widgetProps, onWidgetPropsChange }),
    defaultSize: { gw: 3, gh: 3 },
    minSize: { gw: 2, gh: 2 },
    navigateTo: null,
    dataSource: null
  },
  countdown: {
    title: "countdown",
    component: ({ widgetProps, onWidgetPropsChange }) => /* @__PURE__ */ jsx(CountdownWidget, { widgetProps, onWidgetPropsChange }),
    defaultSize: { gw: 3, gh: 2 },
    minSize: { gw: 2, gh: 2 },
    navigateTo: null,
    dataSource: null
  },
  calendar: {
    title: "calendar",
    component: ({ gridSize }) => /* @__PURE__ */ jsx(CalendarWidget, { gridSize }),
    defaultSize: { gw: 3, gh: 4 },
    minSize: { gw: 2, gh: 3 },
    navigateTo: null,
    dataSource: null
  },
  agent: {
    title: "agent",
    component: ({ data }) => /* @__PURE__ */ jsx(AgentWidget, { data }),
    defaultSize: { gw: 4, gh: 3 },
    minSize: { gw: 3, gh: 2 },
    navigateTo: null,
    dataSource: null
  }
};
const STATE_COPY = {
  offline: "offline · Hermes backend unreachable",
  unavailable: "unavailable · this source is not responding"
};
function WidgetShell({
  title,
  style,
  editing,
  dragging,
  swapTarget,
  trashing,
  state = "ok",
  onRemove,
  onHeaderPointerDown,
  onResizePointerDown,
  onClickThrough,
  children
}) {
  const cls = [
    "home-widget",
    dragging ? "dragging" : "",
    swapTarget ? "swap-target" : "",
    trashing ? "trashing" : ""
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: cls,
      style,
      onClick: !editing && onClickThrough ? onClickThrough : void 0,
      role: !editing && onClickThrough ? "link" : void 0,
      children: [
        /* @__PURE__ */ jsxs("b", { className: "hd", onPointerDown: editing ? onHeaderPointerDown : void 0, children: [
          title,
          state === "stale" && /* @__PURE__ */ jsx("span", { className: "hd-stale", title: "Last update failed — showing previous data", children: " · stale" })
        ] }),
        STATE_COPY[state] ? /* @__PURE__ */ jsx("span", { className: `wstate wstate-${state}`, children: STATE_COPY[state] }) : children,
        editing && onRemove && /* @__PURE__ */ jsx("button", { className: "wremove", onClick: onRemove, "aria-label": `Remove ${title}`, children: "×" }),
        editing && /* @__PURE__ */ jsx("div", { className: "rs", onPointerDown: onResizePointerDown })
      ]
    }
  );
}
function widgetState(source, data) {
  if (source === null) return "ok";
  const failing = data.errors.has(source);
  const has = data[source] != null;
  if (!failing) return has ? "ok" : "loading";
  if (has) return "stale";
  return data.errors.has("status") && data.status == null ? "offline" : "unavailable";
}
const CELL_H = 44;
const GAP = 10;
const PAD = 12;
const GridCanvas = forwardRef(function GridCanvas2({ layout, editing, data, onLayoutChange, onRemove, onWidgetPropsChange, trashRef, onTrashActive }, ref) {
  const stageRef = useRef(null);
  const [stageW, setStageW] = useState(0);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const [adding, setAdding] = useState(null);
  const addRef = useRef(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(el.clientWidth));
    ro.observe(el);
    setStageW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const colW = stageW > 0 ? (stageW - PAD * 2 - GAP * (GRID_COLS - 1)) / GRID_COLS : 0;
  const toPx = (box) => ({
    left: PAD + box.gx * (colW + GAP),
    top: PAD + box.gy * (CELL_H + GAP),
    width: box.gw * colW + (box.gw - 1) * GAP,
    height: box.gh * CELL_H + (box.gh - 1) * GAP
  });
  const pointerOverTrash = (x, y) => {
    const el = trashRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  function startDrag(item, mode, e) {
    if (!editing || colW <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    const stageRect = stageRef.current.getBoundingClientRect();
    const startPx = toPx(item);
    const start = { x: e.clientX, y: e.clientY };
    const others = layout.widgets.filter((w) => w.id !== item.id);
    const init = {
      id: item.id,
      mode,
      candidate: { ...item },
      px: startPx,
      swapWith: null,
      moved: /* @__PURE__ */ new Map(),
      overTrash: false
    };
    dragRef.current = init;
    setDrag(init);
    function onMove(ev) {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      const overTrash = mode === "move" && pointerOverTrash(ev.clientX, ev.clientY);
      onTrashActive(overTrash);
      let next;
      if (mode === "resize") {
        const def = WIDGET_REGISTRY[item.id];
        const minW = def?.minSize.gw ?? 2;
        const minH = def?.minSize.gh ?? 1;
        const gw = Math.max(minW, Math.min(
          GRID_COLS - item.gx,
          Math.round((startPx.width + dx + GAP) / (colW + GAP))
        ));
        const gh = Math.max(
          minH,
          Math.round((startPx.height + dy + GAP) / (CELL_H + GAP))
        );
        const candidate = { gx: item.gx, gy: item.gy, gw, gh };
        next = {
          ...dragRef.current,
          candidate,
          px: {
            ...startPx,
            width: Math.max(70, startPx.width + dx),
            height: Math.max(CELL_H, startPx.height + dy)
          },
          swapWith: null,
          moved: reflow({ ...candidate }, others),
          overTrash: false
        };
      } else {
        const pos = clampPosition(
          item.gx + dx / (colW + GAP),
          item.gy + dy / (CELL_H + GAP),
          item.gw,
          item.gh
        );
        const candidate = { ...pos, gw: item.gw, gh: item.gh };
        const pgx = (ev.clientX - stageRect.left - PAD) / (colW + GAP);
        const pgy = (ev.clientY - stageRect.top - PAD) / (CELL_H + GAP);
        const twin = overTrash ? null : findSwapTarget(pgx, pgy, item, others);
        next = {
          ...dragRef.current,
          candidate,
          px: { ...startPx, left: startPx.left + dx, top: startPx.top + dy },
          swapWith: twin?.id ?? null,
          moved: twin || overTrash ? /* @__PURE__ */ new Map() : reflow({ ...candidate }, others),
          overTrash
        };
      }
      dragRef.current = next;
      setDrag(next);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      onTrashActive(false);
      if (!d) return;
      if (d.overTrash) {
        onRemove(d.id);
        return;
      }
      const widgets = layout.widgets.map((w) => ({ ...w }));
      const me = widgets.find((w) => w.id === d.id);
      if (d.swapWith) {
        const twin = widgets.find((w) => w.id === d.swapWith);
        const { gx, gy } = twin;
        twin.gx = me.gx;
        twin.gy = me.gy;
        me.gx = gx;
        me.gy = gy;
      } else {
        me.gx = d.candidate.gx;
        me.gy = d.candidate.gy;
        me.gw = d.candidate.gw;
        me.gh = d.candidate.gh;
        for (const w of widgets) {
          const gy = d.moved.get(w.id);
          if (gy !== void 0) w.gy = gy;
        }
      }
      onLayoutChange({ ...layout, widgets });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  useImperativeHandle(ref, () => ({
    startExternalAdd(id, e) {
      if (colW <= 0) return;
      const def = WIDGET_REGISTRY[id];
      if (!def) return;
      e.preventDefault();
      const { gw, gh } = def.defaultSize;
      const cellFor = (x, y) => {
        const stageRect = stageRef.current.getBoundingClientRect();
        if (x < stageRect.left || x > stageRect.right || y < stageRect.top || y > stageRect.bottom) {
          return null;
        }
        const pos = clampPosition(
          (x - stageRect.left - PAD) / (colW + GAP),
          (y - stageRect.top - PAD) / (CELL_H + GAP),
          gw
        );
        return { ...pos, gw, gh };
      };
      const startPoint = { x: e.clientX, y: e.clientY };
      const init = {
        id,
        pointer: { x: e.clientX, y: e.clientY },
        candidate: cellFor(e.clientX, e.clientY),
        moved: /* @__PURE__ */ new Map()
      };
      addRef.current = init;
      setAdding(init);
      function onMove(ev) {
        const candidate = cellFor(ev.clientX, ev.clientY);
        const next = {
          id,
          pointer: { x: ev.clientX, y: ev.clientY },
          candidate,
          moved: candidate ? reflow({ ...candidate }, layout.widgets) : /* @__PURE__ */ new Map()
        };
        addRef.current = next;
        setAdding(next);
      }
      function onUp(ev) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const a = addRef.current;
        addRef.current = null;
        setAdding(null);
        if (!a) return;
        const moved = Math.hypot(ev.clientX - startPoint.x, ev.clientY - startPoint.y);
        let cell = a.candidate;
        let pushed = a.moved;
        if (!cell) {
          if (moved > 6) return;
          cell = { ...findFreeSlot(layout.widgets, { gw, gh }), gw, gh };
          pushed = /* @__PURE__ */ new Map();
        }
        const widgets = layout.widgets.map((w) => {
          const gy = pushed.get(w.id);
          return gy !== void 0 ? { ...w, gy } : { ...w };
        });
        widgets.push({ id, gx: cell.gx, gy: cell.gy, gw, gh });
        onLayoutChange({ ...layout, widgets });
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }
  }), [colW, layout, onLayoutChange]);
  const previewMoved = drag?.moved ?? adding?.moved ?? null;
  const maxRow = layout.widgets.reduce(
    (m, w) => Math.max(m, (previewMoved?.get(w.id) ?? w.gy) + w.gh),
    0
  );
  const addRow = adding?.candidate ? adding.candidate.gy + adding.candidate.gh : 0;
  const stageH = PAD * 2 + Math.max(maxRow, addRow) * (CELL_H + GAP) - GAP;
  const ghostBox = drag ? drag.overTrash ? null : drag.swapWith ? { ...layout.widgets.find((w) => w.id === drag.swapWith), gw: drag.candidate.gw, gh: drag.candidate.gh } : drag.candidate : adding?.candidate ?? null;
  const addDef = adding ? WIDGET_REGISTRY[adding.id] : null;
  return /* @__PURE__ */ jsxs("div", { ref: stageRef, className: "home-stage", style: { height: Math.max(stageH, 200) }, children: [
    /* @__PURE__ */ jsx(
      "div",
      {
        className: `home-ghost${ghostBox ? " visible" : ""}${drag?.swapWith ? " swap" : ""}`,
        style: ghostBox ? toPx(ghostBox) : void 0
      }
    ),
    colW > 0 && layout.widgets.map((item) => {
      const def = WIDGET_REGISTRY[item.id];
      if (!def) return null;
      const isDragged = drag?.id === item.id;
      const isTwinTarget = drag?.swapWith === item.id;
      let box = item;
      if (!isDragged) {
        if (isTwinTarget && drag) {
          const origin = layout.widgets.find((w) => w.id === drag.id);
          box = { ...item, gx: origin.gx, gy: origin.gy };
        } else {
          const gy = previewMoved?.get(item.id);
          if (gy !== void 0) box = { ...item, gy };
        }
      }
      const style = isDragged && drag ? drag.px : toPx(box);
      const Component = def.component;
      return /* @__PURE__ */ jsx(
        WidgetShell,
        {
          title: def.title,
          style,
          editing,
          dragging: isDragged,
          swapTarget: isTwinTarget,
          trashing: isDragged && drag?.overTrash,
          state: widgetState(def.dataSource, data),
          onRemove: () => onRemove(item.id),
          onHeaderPointerDown: (e) => startDrag(item, "move", e),
          onResizePointerDown: (e) => startDrag(item, "resize", e),
          onClickThrough: def.navigateTo ? () => navigateTo(def.navigateTo) : void 0,
          children: /* @__PURE__ */ jsx(
            Component,
            {
              data,
              widgetProps: item.props ?? {},
              onWidgetPropsChange: (p) => onWidgetPropsChange(item.id, p),
              editing,
              gridSize: { gw: box.gw, gh: box.gh }
            }
          )
        },
        item.id
      );
    }),
    adding && addDef && /* @__PURE__ */ jsxs(
      "div",
      {
        className: "home-add-ghost",
        style: { left: adding.pointer.x, top: adding.pointer.y },
        children: [
          "+ ",
          addDef.title
        ]
      }
    )
  ] });
});
function WidgetCatalog({ layout, onChipPointerDown }) {
  const placed = new Set(layout.widgets.map((w) => w.id));
  const available = Object.entries(WIDGET_REGISTRY).filter(([id]) => !placed.has(id));
  return /* @__PURE__ */ jsx("div", { className: "home-catalog", children: /* @__PURE__ */ jsxs("div", { className: "home-catalog-inner", children: [
    /* @__PURE__ */ jsx("span", { className: "home-catalog-hint", children: "drag a widget here to remove it" }),
    available.map(([id, def]) => /* @__PURE__ */ jsxs(
      "button",
      {
        className: "home-catalog-chip",
        onPointerDown: (e) => onChipPointerDown(id, e),
        children: [
          "+ ",
          def.title
        ]
      },
      id
    ))
  ] }) });
}
const POLL_MS = 1e4;
const SOURCES = {
  status: () => api.getStatus(),
  system: () => api.getSystemStats(),
  analytics: () => api.getAnalytics(1),
  cron: () => api.getCronJobs(),
  sessions: () => api.getSessions(9),
  logs: () => api.getLogs({ lines: 50, level: "ERROR" })
};
function useHomeData() {
  const [data, setData] = useState({
    status: null,
    system: null,
    analytics: null,
    cron: null,
    sessions: null,
    logs: null,
    errors: /* @__PURE__ */ new Set()
  });
  const timer = useRef(null);
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (document.hidden) return;
      const keys = Object.keys(SOURCES);
      const results = await Promise.allSettled(keys.map((k) => SOURCES[k]()));
      if (cancelled) return;
      setData((prev) => {
        const next = { ...prev, errors: new Set(prev.errors) };
        keys.forEach((key, i) => {
          const r = results[i];
          if (r.status === "fulfilled") {
            next[key] = r.value;
            next.errors.delete(key);
          } else {
            next.errors.add(key);
          }
        });
        return next;
      });
    }
    poll();
    timer.current = setInterval(poll, POLL_MS);
    const onVis = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return data;
}
function buildRecommendations(data, live) {
  const out = [];
  const totals = data.analytics?.totals;
  if (data.errors.size > 0) {
    out.push({
      severity: "crit",
      title: `${data.errors.size} data source(s) failing`,
      detail: `Polling errors on: ${[...data.errors].join(", ")}. Check the gateway and plugin API.`
    });
  }
  const errorLogs = data.logs?.lines?.length ?? 0;
  if (errorLogs > 0) {
    out.push({
      severity: errorLogs > 10 ? "crit" : "warn",
      title: `${errorLogs} error line(s) in the gateway log`,
      detail: "Tail the log to see if a platform or plugin is throwing repeatedly."
    });
  }
  const est = totals?.total_estimated_cost ?? 0;
  if (est > 0.5) {
    out.push({
      severity: est > 2 ? "crit" : "warn",
      title: `≈$${est.toFixed(2)} estimated today`,
      detail: est > 2 ? "Cost is climbing. Consider a cheaper model, context compression, or capping long sessions." : "Spend is moderate — keep an eye on it if you're mid-migration."
    });
  }
  const totalTok = (totals?.total_input ?? 0) + (totals?.total_output ?? 0);
  if (totalTok > 2e6) {
    out.push({
      severity: "warn",
      title: `${(totalTok / 1e6).toFixed(1)}M tokens today`,
      detail: "Heavy usage. /compact long sessions and reuse cached context to cut input tokens."
    });
  }
  const repeated = mostRepeatedTool(live.toolHistory);
  if (repeated && repeated.count >= 5) {
    out.push({
      severity: "info",
      title: `"${repeated.name}" called ${repeated.count}× recently`,
      detail: "A repeated tool sequence is a skill in disguise — consider saving it with skill_manage."
    });
  }
  const activeSessions = (data.sessions?.sessions ?? []).filter((s) => s.is_active).length;
  if (activeSessions >= 3) {
    out.push({
      severity: "info",
      title: `${activeSessions} sessions active at once`,
      detail: "Parallel work is running — delegate_task fans out well, but watch for tool conflicts on shared files."
    });
  }
  if (live.subagents.some((a) => a.status === "running")) {
    out.push({
      severity: "info",
      title: `${live.subagents.filter((a) => a.status === "running").length} subagent(s) working`,
      detail: "Orchestration in flight. Check back for their consolidated reports."
    });
  }
  const slow = live.currentTool && Date.now() - live.currentTool.startedAt > 12e4 ? live.currentTool : null;
  if (slow) {
    out.push({
      severity: "warn",
      title: `"${slow.name}" running >2min`,
      detail: "Long tool call — it may be a build, a big search, or a hung process. Watch it."
    });
  }
  const active2 = (data.sessions?.sessions ?? []).find((s) => s.is_active);
  if (active2) {
    if ((active2.message_count ?? 0) > 80) {
      out.push({
        severity: "warn",
        title: `Active session at ${active2.message_count} messages`,
        detail: "Long context costs more per turn and degrades focus. A fresh session or /compact resets the cache."
      });
    }
    if ((active2.tool_call_count ?? 0) > 40) {
      out.push({
        severity: "info",
        title: `${active2.tool_call_count} tool calls in the active session`,
        detail: "High tool churn — the task may benefit from a dedicated skill or a subagent."
      });
    }
  }
  const topSkill = data.analytics?.skills?.top_skills?.[0];
  if (topSkill && topSkill.total_count > 0 && topSkill.percentage < 5) {
    out.push({
      severity: "info",
      title: `Top skill "${topSkill.skill}" only ${topSkill.percentage}% of loads`,
      detail: "Your most-used skill is still under-leveraged — consider bundling related skills."
    });
  }
  if (out.length === 0) {
    out.push({
      severity: "info",
      title: "All quiet on the home front",
      detail: "No anomalies right now. The coach stays silent until there's something worth saying."
    });
  }
  return out;
}
function mostRepeatedTool(history) {
  const counts = /* @__PURE__ */ new Map();
  for (const t of history) {
    counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
  }
  let best = null;
  for (const [name, count] of counts) {
    if (!best || count > best.count) best = { name, count };
  }
  return best && best.count >= 2 ? best : null;
}
function fmtCost(n) {
  if (n === void 0 || !Number.isFinite(n)) return "—";
  if (n < 0.01) return `$${(n * 1e3).toFixed(2)}m`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
function fmtTok(n) {
  if (n === void 0 || !Number.isFinite(n)) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}
function timeAgo(at) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1e3));
  if (s < 5) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
function hhmm(at) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}
function extractPaths(tools) {
  const paths = /* @__PURE__ */ new Set();
  for (const t of tools) {
    const args = t.args;
    if (!args || typeof args !== "object") continue;
    const a = args;
    for (const key of ["path", "file", "output_path", "workdir", "cwd", "target"]) {
      const v = a[key];
      if (typeof v === "string" && v.length > 1) paths.add(v);
    }
    if (typeof a.command === "string") {
      const m = a.command.match(/["']([^"']+\.[a-zA-Z0-9_]+)["']/g);
      if (m) m.forEach((s) => paths.add(s.slice(1, -1)));
    }
  }
  return [...paths].slice(0, 8);
}
function fileGlyph(path) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "ts" || ext === "tsx") return "τ";
  if (ext === "js" || ext === "jsx" || ext === "mjs") return "JS";
  if (ext === "py") return "py";
  if (ext === "md") return "MD";
  if (ext === "json") return "{}";
  if (ext === "yaml" || ext === "yml") return "Y";
  if (ext === "css" || ext === "html") return "#";
  if (["png", "jpg", "webp", "gif", "svg"].includes(ext)) return "▣";
  return "·";
}
function PanelTitle({ children }) {
  return /* @__PURE__ */ jsx("b", { className: "home-theater-panel-title", children });
}
function NowPanel({ data, live }) {
  const scene = useScene(live);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1e3);
    return () => clearInterval(t);
  }, []);
  const status = live.busy ? live.currentTool ? "working" : "thinking" : data.status?.gateway_running ? "idle" : "gateway down";
  return /* @__PURE__ */ jsxs("section", { className: "home-theater-panel home-theater-now", children: [
    /* @__PURE__ */ jsxs(PanelTitle, { children: [
      /* @__PURE__ */ jsx("span", { className: `home-agent-dot ${live.busy ? "busy" : ""}`, "aria-hidden": "true" }),
      "NOW · ",
      status.toUpperCase(),
      live.activeTitle && /* @__PURE__ */ jsxs("span", { className: "home-theater-sub", children: [
        "— ",
        live.activeTitle
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "home-theater-scene", children: /* @__PURE__ */ jsx(LiveScene, { scene }) }),
    /* @__PURE__ */ jsxs("div", { className: "home-theater-feed", children: [
      live.feed.length === 0 && /* @__PURE__ */ jsx("div", { className: "home-theater-dim", children: "no live activity yet — the feed fills as the agent works" }),
      live.feed.slice(0, 40).map((e) => /* @__PURE__ */ jsxs("div", { className: "home-theater-feed-row", children: [
        /* @__PURE__ */ jsx("span", { className: "home-theater-feed-time", children: hhmm(e.at) }),
        /* @__PURE__ */ jsx(
          "span",
          {
            className: `home-theater-feed-kind ${e.kind}${e.ok === false ? " bad" : ""}`,
            "aria-hidden": "true"
          }
        ),
        /* @__PURE__ */ jsx("span", { className: "home-theater-feed-label", children: e.label }),
        e.detail && /* @__PURE__ */ jsx("span", { className: "home-theater-feed-detail", children: e.detail })
      ] }, e.id))
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "home-theater-foot", children: [
      /* @__PURE__ */ jsxs("span", { children: [
        "last event ",
        live.lastEventAt ? timeAgo(live.lastEventAt) : "—"
      ] }),
      /* @__PURE__ */ jsx("span", { children: live.live ? "live" : "polling" }),
      /* @__PURE__ */ jsxs("span", { children: [
        "updated ",
        timeAgo(now)
      ] })
    ] })
  ] });
}
function ToolPanel({ live }) {
  return /* @__PURE__ */ jsxs("section", { className: "home-theater-panel", children: [
    /* @__PURE__ */ jsx(PanelTitle, { children: "FUNCTION" }),
    live.currentTool ? /* @__PURE__ */ jsxs("div", { className: "home-theater-fn-current", children: [
      /* @__PURE__ */ jsxs("div", { className: "home-theater-fn-name", children: [
        /* @__PURE__ */ jsx("span", { className: "home-theater-fn-dot running", "aria-hidden": "true" }),
        live.currentTool.name,
        /* @__PURE__ */ jsx("span", { className: "home-theater-fn-state running", children: "running" })
      ] }),
      /* @__PURE__ */ jsx("pre", { className: "home-theater-fn-args", children: argPreview(live.currentTool.args, 600) ?? "awaiting args…" })
    ] }) : /* @__PURE__ */ jsx("div", { className: "home-theater-dim", children: "no tool running" }),
    live.toolHistory.length > 0 && /* @__PURE__ */ jsx("div", { className: "home-theater-fn-history", children: live.toolHistory.slice(0, 8).map((t, i) => /* @__PURE__ */ jsxs("div", { className: "home-theater-fn-row", children: [
      /* @__PURE__ */ jsx(
        "span",
        {
          className: `home-theater-fn-dot ${t.status === "complete" ? "ok" : "bad"}`,
          "aria-hidden": "true"
        }
      ),
      /* @__PURE__ */ jsx("span", { className: "home-theater-fn-hname", children: t.name }),
      /* @__PURE__ */ jsx("span", { className: "home-theater-fn-hargs", children: argPreview(t.args, 90) }),
      t.duration !== void 0 && /* @__PURE__ */ jsxs("span", { className: "home-theater-fn-hdur", children: [
        t.duration.toFixed(1),
        "s"
      ] })
    ] }, `${t.name}-${t.startedAt}-${i}`)) })
  ] });
}
function TokenPanel({ data }) {
  const totals = data.analytics?.totals;
  const byModel = data.analytics?.by_model ?? [];
  const active2 = (data.sessions?.sessions ?? []).find((s) => s.is_active);
  return /* @__PURE__ */ jsxs("section", { className: "home-theater-panel", children: [
    /* @__PURE__ */ jsx(PanelTitle, { children: "TOKENS & COST" }),
    /* @__PURE__ */ jsxs("div", { className: "home-theater-tok-grid", children: [
      /* @__PURE__ */ jsxs("div", { className: "home-theater-tok-cell", children: [
        /* @__PURE__ */ jsx("span", { className: "home-theater-tok-num", children: fmtTok(totals?.total_input) }),
        /* @__PURE__ */ jsx("span", { className: "home-theater-tok-lbl", children: "input today" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "home-theater-tok-cell", children: [
        /* @__PURE__ */ jsx("span", { className: "home-theater-tok-num", children: fmtTok(totals?.total_output) }),
        /* @__PURE__ */ jsx("span", { className: "home-theater-tok-lbl", children: "output today" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "home-theater-tok-cell", children: [
        /* @__PURE__ */ jsx("span", { className: "home-theater-tok-num", children: fmtTok(totals?.total_cache_read) }),
        /* @__PURE__ */ jsx("span", { className: "home-theater-tok-lbl", children: "cache read" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "home-theater-tok-cell", children: [
        /* @__PURE__ */ jsx("span", { className: "home-theater-tok-num home-theater-money", children: fmtCost(totals?.total_estimated_cost) }),
        /* @__PURE__ */ jsx("span", { className: "home-theater-tok-lbl", children: "est. cost today" })
      ] })
    ] }),
    byModel.length > 0 && /* @__PURE__ */ jsx("div", { className: "home-theater-tok-models", children: byModel.slice(0, 4).map((m) => /* @__PURE__ */ jsxs("div", { className: "home-theater-tok-model", children: [
      /* @__PURE__ */ jsx("span", { className: "home-theater-tok-mname", children: m.model }),
      /* @__PURE__ */ jsxs("span", { className: "home-theater-tok-mtok", children: [
        fmtTok(m.input_tokens + m.output_tokens),
        " tok"
      ] }),
      /* @__PURE__ */ jsx("span", { className: "home-theater-tok-mcost", children: fmtCost(m.estimated_cost) })
    ] }, m.model)) }),
    active2 && /* @__PURE__ */ jsxs("div", { className: "home-theater-tok-session", children: [
      /* @__PURE__ */ jsx("span", { className: "home-theater-tok-slbl", children: "active session" }),
      /* @__PURE__ */ jsx("span", { className: "home-theater-tok-stitle", children: active2.title ?? active2.id }),
      /* @__PURE__ */ jsxs("span", { className: "home-theater-tok-snum", children: [
        fmtTok((active2.input_tokens ?? 0) + (active2.output_tokens ?? 0)),
        " tok ·",
        " ",
        active2.message_count ?? 0,
        " msg · ",
        active2.tool_call_count ?? 0,
        " tools"
      ] })
    ] })
  ] });
}
function ProjectPanel({ data, live }) {
  const active2 = (data.sessions?.sessions ?? []).find((s) => s.is_active);
  const paths = useMemo(
    () => extractPaths([...live.currentTool ? [live.currentTool] : [], ...live.toolHistory]),
    [live.currentTool, live.toolHistory]
  );
  return /* @__PURE__ */ jsxs("section", { className: "home-theater-panel", children: [
    /* @__PURE__ */ jsx(PanelTitle, { children: "PROJECT" }),
    active2 ? /* @__PURE__ */ jsxs("div", { className: "home-theater-proj-session", children: [
      /* @__PURE__ */ jsx("div", { className: "home-theater-proj-title", children: active2.title ?? "(untitled session)" }),
      /* @__PURE__ */ jsxs("div", { className: "home-theater-proj-meta", children: [
        active2.model ?? "—",
        " · ",
        active2.source ?? "—",
        " · started ",
        timeAgo(active2.started_at * 1e3)
      ] })
    ] }) : /* @__PURE__ */ jsx("div", { className: "home-theater-dim", children: "no active session" }),
    paths.length > 0 ? /* @__PURE__ */ jsx("div", { className: "home-theater-proj-files", children: paths.map((p) => /* @__PURE__ */ jsxs("div", { className: "home-theater-proj-file", children: [
      /* @__PURE__ */ jsx("span", { className: "home-theater-proj-glyph", children: fileGlyph(p) }),
      /* @__PURE__ */ jsx("span", { className: "home-theater-proj-path", children: p })
    ] }, p)) }) : /* @__PURE__ */ jsx("div", { className: "home-theater-dim", children: "files touched by the agent will appear here as it works" }),
    live.subagents.length > 0 && /* @__PURE__ */ jsx("div", { className: "home-theater-proj-subagents", children: live.subagents.map((a) => /* @__PURE__ */ jsxs("div", { className: "home-theater-proj-subagent", children: [
      /* @__PURE__ */ jsx(
        "span",
        {
          className: `home-theater-proj-subdot ${a.status === "running" ? "run" : "done"}`,
          "aria-hidden": "true"
        }
      ),
      /* @__PURE__ */ jsx("span", { className: "home-theater-proj-subname", children: a.name }),
      a.goal && /* @__PURE__ */ jsxs("span", { className: "home-theater-proj-subgoal", children: [
        "— ",
        a.goal
      ] })
    ] }, a.name)) })
  ] });
}
function CoachPanel({ data, live }) {
  const recs = useMemo(
    () => buildRecommendations(data, live),
    [data, live]
  );
  return /* @__PURE__ */ jsxs("section", { className: "home-theater-panel", children: [
    /* @__PURE__ */ jsx(PanelTitle, { children: "RECOMMENDATIONS" }),
    /* @__PURE__ */ jsx("div", { className: "home-theater-rec-list", children: recs.map((r, i) => /* @__PURE__ */ jsxs("div", { className: `home-theater-rec ${r.severity}`, children: [
      /* @__PURE__ */ jsx("span", { className: "home-theater-rec-tag", children: r.severity === "crit" ? "!!" : r.severity === "warn" ? "!" : "i" }),
      /* @__PURE__ */ jsxs("div", { className: "home-theater-rec-body", children: [
        /* @__PURE__ */ jsx("div", { className: "home-theater-rec-title", children: r.title }),
        /* @__PURE__ */ jsx("div", { className: "home-theater-rec-detail", children: r.detail })
      ] })
    ] }, i)) })
  ] });
}
function AgentTheater({ data }) {
  const live = useAgentLive();
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") exitTheater();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: "home-theater", role: "dialog", "aria-label": "Agent theater", children: [
    /* @__PURE__ */ jsxs("header", { className: "home-theater-head", children: [
      /* @__PURE__ */ jsx("span", { className: `home-agent-dot ${live.busy ? "busy" : ""}`, "aria-hidden": "true" }),
      /* @__PURE__ */ jsx("span", { className: "home-theater-title", children: "AGENT THEATER" }),
      /* @__PURE__ */ jsxs("span", { className: "home-theater-sub", children: [
        live.busy ? "the agent is working" : "the agent is idle",
        " · ",
        live.live ? "live feed" : "polling"
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "home-theater-release",
          onClick: () => exitTheater(),
          title: "Release control (Esc)",
          children: "release control"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "home-theater-grid", children: [
      /* @__PURE__ */ jsx("div", { className: "home-theater-span-7", children: /* @__PURE__ */ jsx(NowPanel, { data, live }) }),
      /* @__PURE__ */ jsx("div", { className: "home-theater-span-5", children: /* @__PURE__ */ jsx(ToolPanel, { live }) }),
      /* @__PURE__ */ jsx("div", { className: "home-theater-span-5", children: /* @__PURE__ */ jsx(TokenPanel, { data }) }),
      /* @__PURE__ */ jsx("div", { className: "home-theater-span-7", children: /* @__PURE__ */ jsx(ProjectPanel, { data, live }) }),
      /* @__PURE__ */ jsx("div", { className: "home-theater-span-12", children: /* @__PURE__ */ jsx(CoachPanel, { data, live }) })
    ] })
  ] });
}
const LAYOUT_VERSION = 1;
const DEFAULT_LAYOUT = {
  version: LAYOUT_VERSION,
  widgets: [
    { id: "ascii", gx: 0, gy: 0, gw: 3, gh: 6 },
    { id: "clock", gx: 3, gy: 0, gw: 5, gh: 3 },
    { id: "gateway", gx: 8, gy: 0, gw: 4, gh: 3 },
    { id: "tokens", gx: 3, gy: 3, gw: 5, gh: 4 },
    { id: "host", gx: 8, gy: 3, gw: 4, gh: 4 },
    { id: "matrix", gx: 0, gy: 6, gw: 3, gh: 4 },
    { id: "sessions", gx: 3, gy: 7, gw: 3, gh: 3 },
    { id: "cron", gx: 6, gy: 7, gw: 3, gh: 3 },
    { id: "errors", gx: 9, gy: 7, gw: 3, gh: 3 }
  ]
};
function isValidWidget(w) {
  if (typeof w !== "object" || w === null) return false;
  const o = w;
  return typeof o.id === "string" && [o.gx, o.gy, o.gw, o.gh].every((n) => typeof n === "number" && Number.isFinite(n));
}
function parseLayout(raw) {
  if (typeof raw !== "object" || raw === null) return DEFAULT_LAYOUT;
  const o = raw;
  if (o.version !== LAYOUT_VERSION || !Array.isArray(o.widgets)) return DEFAULT_LAYOUT;
  const widgets = o.widgets.filter(isValidWidget);
  return { version: LAYOUT_VERSION, widgets };
}
const LAYOUT_URL = "/api/plugins/home-dashboard/layout";
function loadLayout() {
  return fetchJSON(LAYOUT_URL).then((r) => r.layout == null ? DEFAULT_LAYOUT : parseLayout(r.layout)).catch(() => DEFAULT_LAYOUT);
}
function saveLayout(layout) {
  return fetchJSON(LAYOUT_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layout })
  });
}
function HomePage() {
  const [layout, setLayout] = useState(null);
  const [editing, setEditing] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const [theaterOn, setTheaterOn] = useState(false);
  const [toast, setToast] = useState(null);
  const rootRef = useRef(null);
  const catalogRef = useRef(null);
  const gridRef = useRef(null);
  const dirty = useRef(false);
  const toastTimer = useRef(null);
  const data = useHomeData();
  useEffect(() => subscribeTheater(setTheaterOn), []);
  useEffect(() => {
    if (theaterOn && editing) setEditing(false);
  }, [theaterOn, editing]);
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4e3);
  }, []);
  const recomputeShowEdit = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const canScroll = el.scrollHeight - el.clientHeight > 24;
    setShowEdit(!canScroll || el.scrollTop > 16);
  }, []);
  useEffect(() => {
    loadLayout().then(setLayout);
  }, []);
  useEffect(() => {
    recomputeShowEdit();
  }, [layout, editing, recomputeShowEdit]);
  const update = useCallback((next) => {
    dirty.current = true;
    setLayout(next);
  }, []);
  const saveTimer = useRef(null);
  const updateWidgetProps = useCallback(
    (id, props) => {
      setLayout((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          widgets: prev.widgets.map((w) => w.id === id ? { ...w, props } : w)
        };
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          saveLayout(next).then(
            () => {
              dirty.current = false;
            },
            () => showToast("Could not save the layout — it is kept for this session")
          );
        }, 800);
        dirty.current = true;
        return next;
      });
    },
    [showToast]
  );
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);
  const toggleEditing = useCallback(async () => {
    if (editing && dirty.current && layout) {
      try {
        await saveLayout(layout);
        dirty.current = false;
      } catch {
        showToast("Could not save the layout — it is kept for this session");
      }
    }
    setEditing((e) => !e);
  }, [editing, layout, showToast]);
  useEffect(() => {
    if (!editing) return;
    const onKey = (e) => {
      if (e.key === "Escape") void toggleEditing();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, toggleEditing]);
  if (!layout) return null;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: rootRef,
      className: `home-root${editing ? " editing" : ""}`,
      onScroll: recomputeShowEdit,
      children: [
        /* @__PURE__ */ jsx(
          "div",
          {
            ref: catalogRef,
            className: `home-catalog-wrap${editing ? " open" : ""}${overTrash ? " trash-active" : ""}`,
            "aria-hidden": !editing,
            children: /* @__PURE__ */ jsx(
              WidgetCatalog,
              {
                layout,
                onChipPointerDown: (id, e) => gridRef.current?.startExternalAdd(id, e)
              }
            )
          }
        ),
        /* @__PURE__ */ jsx(
          GridCanvas,
          {
            ref: gridRef,
            layout,
            editing,
            data,
            onLayoutChange: update,
            onRemove: (id) => update({ ...layout, widgets: layout.widgets.filter((w) => w.id !== id) }),
            onWidgetPropsChange: updateWidgetProps,
            trashRef: catalogRef,
            onTrashActive: setOverTrash
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: `home-editbar${editing || showEdit ? " visible" : ""}`, children: [
          editing && /* @__PURE__ */ jsx(
            "button",
            {
              className: "home-fab home-fab-enter",
              onClick: () => update(DEFAULT_LAYOUT),
              title: "Restore default layout",
              "aria-label": "Restore default layout",
              children: /* @__PURE__ */ jsx("span", { className: "home-fab-spin", children: "↺" })
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              className: `home-fab${editing ? " active" : ""}`,
              onClick: () => void toggleEditing(),
              title: editing ? "Done editing" : "Edit layout",
              "aria-label": editing ? "Done editing" : "Edit layout",
              children: [
                /* @__PURE__ */ jsx("span", { className: "home-fab-ico ico-edit", "aria-hidden": "true", children: "✎" }),
                /* @__PURE__ */ jsx("span", { className: "home-fab-ico ico-done", "aria-hidden": "true", children: "✓" })
              ]
            }
          )
        ] }),
        toast && /* @__PURE__ */ jsx("div", { className: "home-toast", role: "status", children: toast }),
        theaterOn && /* @__PURE__ */ jsx(AgentTheater, { data })
      ]
    }
  );
}
const homeCss = `/* Home page — rice-style widget grid.\r
 * Every color routes through --home-accent (the active theme's primary),\r
 * so switching themes recolors the whole page with zero widget changes.\r
 * Swap teal (#2dd4bf) stays fixed: it is interaction semantics, not theme. */\r
\r
.home-root {\r
  --home-accent: var(--color-primary, var(--ui-accent, #ffd700));\r
  --home-accent-dim: color-mix(in srgb, var(--home-accent) 55%, #000);\r
  /* Readable secondary text (headers, captions): dim was ~3:1 on the glass. */\r
  --home-accent-soft: color-mix(in srgb, var(--home-accent) 82%, #9aa3b5);\r
  --home-surface: color-mix(\r
    in srgb,\r
    var(--home-accent) 6%,\r
    var(--ui-editor-surface-background, rgb(10 10 14 / 0.55))\r
  );\r
  --home-border: color-mix(in srgb, var(--home-accent) 18%, transparent);\r
  --home-error: var(--color-destructive, #e25555);\r
  position: relative;\r
  height: 100%;\r
  overflow: auto;\r
  font-family: var(--theme-font-mono, ui-monospace, monospace);\r
  color: var(--color-foreground, var(--ui-text-primary, #d8dce6));\r
}\r
\r
.home-stage {\r
  position: relative;\r
  min-height: 60vh;\r
  touch-action: none;\r
}\r
\r
.home-widget {\r
  position: absolute;\r
  border-radius: 8px;\r
  padding: 10px 12px;\r
  background: var(--home-surface);\r
  border: 1px solid var(--home-border);\r
  backdrop-filter: blur(12px);\r
  -webkit-backdrop-filter: blur(12px);\r
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.5);\r
  overflow: hidden;\r
  transition: left 0.18s ease, top 0.18s ease;\r
  container-type: size;\r
  font-size: 11px;\r
  line-height: 1.5;\r
  /* Promote each widget to its own compositor layer so the constantly\r
   * repainting matrix canvas doesn't force the neighbours' backdrop-filter\r
   * to recompose every frame — that recomposition is what produced the\r
   * horizontal flicker sweeping across the glass panels. */\r
  transform: translateZ(0);\r
  contain: paint;\r
}\r
.home-root.editing .home-widget { user-select: none; }\r
.home-widget.dragging {\r
  transition: none;\r
  opacity: 0.9;\r
  border-color: var(--home-accent);\r
  z-index: 50;\r
  cursor: grabbing;\r
}\r
.home-widget.swap-target {\r
  border-color: #2dd4bf;\r
  box-shadow: 0 0 0 1px rgb(45 212 191 / 0.5), 0 10px 30px rgb(0 0 0 / 0.5);\r
}\r
/* Over the trash zone — about to be deleted. */\r
.home-widget.trashing {\r
  opacity: 0.45;\r
  border-color: var(--home-error);\r
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--home-error) 60%, transparent),\r
    0 10px 30px rgb(0 0 0 / 0.5);\r
}\r
\r
/* Floating label that follows the pointer while dragging a new widget in. */\r
.home-add-ghost {\r
  position: fixed;\r
  z-index: 70;\r
  transform: translate(-50%, -140%);\r
  padding: 4px 10px;\r
  border-radius: 6px;\r
  font-size: 11px;\r
  white-space: nowrap;\r
  pointer-events: none;\r
  color: var(--home-accent);\r
  background: var(--home-surface);\r
  border: 1px solid var(--home-accent);\r
  backdrop-filter: blur(12px);\r
  -webkit-backdrop-filter: blur(12px);\r
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);\r
}\r
\r
.home-widget .hd {\r
  display: block;\r
  font-size: 9.5px;\r
  letter-spacing: 0.18em;\r
  margin-bottom: 6px;\r
  font-weight: 700;\r
  text-transform: uppercase;\r
  color: var(--home-accent-soft);\r
  white-space: nowrap;\r
  overflow: hidden;\r
}\r
.home-widget .hd::before { content: "── "; opacity: 0.5; }\r
.home-widget .hd::after { content: " ─────────────────────────────────"; opacity: 0.3; }\r
.home-root.editing .home-widget .hd { cursor: grab; }\r
\r
.home-widget .rs {\r
  position: absolute;\r
  right: 2px;\r
  bottom: 2px;\r
  width: 13px;\r
  height: 13px;\r
  cursor: nwse-resize;\r
  border-right: 2px solid color-mix(in srgb, var(--home-accent) 45%, transparent);\r
  border-bottom: 2px solid color-mix(in srgb, var(--home-accent) 45%, transparent);\r
  border-radius: 2px;\r
  z-index: 3;\r
}\r
.home-widget .wremove {\r
  position: absolute;\r
  top: 4px;\r
  right: 6px;\r
  z-index: 3;\r
  background: none;\r
  border: none;\r
  color: var(--home-error);\r
  font-size: 13px;\r
  line-height: 1;\r
  cursor: pointer;\r
  padding: 2px 4px;\r
}\r
.home-widget .werr { color: var(--home-error); }\r
/* Data-source states (widget-state.ts): honest copy per failure kind. */\r
.home-widget .wstate { display: block; font-size: 10px; letter-spacing: 0.04em; }\r
.home-widget .wstate::before { content: "● "; }\r
.home-widget .wstate-offline { color: var(--home-error); }\r
.home-widget .wstate-unavailable { color: #f5b945; }\r
.home-widget .hd .hd-stale { color: #f5b945; letter-spacing: 0.1em; opacity: 0.8; }\r
\r
/* ── hover controls (contextual chrome, rest mode only) ──\r
 * Reusable floating control rendered inside a widget body. Hidden by default,\r
 * fades in while hovering the widget, and fully suppressed in edit mode so it\r
 * never fights drag/resize. Widgets opt in by rendering <HoverCtl>/<HoverArrows>. */\r
.hover-ctl {\r
  position: absolute;\r
  top: 4px;\r
  right: 6px;\r
  z-index: 4;\r
  display: flex;\r
  align-items: center;\r
  gap: 4px;\r
  opacity: 0;\r
  pointer-events: none;\r
  transition: opacity 0.18s ease;\r
  /* Sits on the glass without a hard edge. */\r
  padding: 1px 3px;\r
  border-radius: 6px;\r
  background: color-mix(in srgb, var(--home-surface) 80%, transparent);\r
}\r
.home-widget:hover .hover-ctl,\r
.hover-ctl:focus-within { opacity: 1; pointer-events: auto; }\r
.home-root.editing .hover-ctl { display: none; }\r
@media (hover: none) {\r
  /* Touch: no hover, so keep controls reachable but understated. */\r
  .hover-ctl { opacity: 0.5; pointer-events: auto; }\r
}\r
\r
.hv-arrow {\r
  background: none;\r
  border: none;\r
  cursor: pointer;\r
  padding: 0 3px;\r
  color: var(--home-accent-dim);\r
  font-size: 14px;\r
  line-height: 1;\r
  font-family: inherit;\r
}\r
.hv-arrow:hover:not(:disabled) { color: var(--home-accent); }\r
.hv-arrow:disabled { opacity: 0.3; cursor: default; }\r
.hv-label {\r
  font-size: 9px;\r
  letter-spacing: 0.1em;\r
  text-transform: uppercase;\r
  color: var(--home-accent-dim);\r
  white-space: nowrap;\r
}\r
.hv-label-btn {\r
  background: none;\r
  border: none;\r
  cursor: pointer;\r
  font: inherit;\r
  letter-spacing: 0.1em;\r
  padding: 0;\r
}\r
.hv-label-btn:hover { color: var(--home-accent); }\r
\r
/* Toggle/option buttons inside a hover control (clock format, host view…). */\r
.hv-opt {\r
  background: none;\r
  border: none;\r
  cursor: pointer;\r
  font: inherit;\r
  font-size: 9px;\r
  letter-spacing: 0.08em;\r
  text-transform: uppercase;\r
  color: var(--home-accent-dim);\r
  padding: 0 4px;\r
  border-radius: 4px;\r
}\r
.hv-opt:hover { color: var(--home-accent); }\r
.hv-opt.on { color: #000; background: var(--home-accent); }\r
\r
/* Extra detail that smoothly expands on widget hover (rest mode only). Uses\r
 * the 0fr→1fr grid trick so it animates real height without a fixed value. */\r
.hover-reveal {\r
  display: grid;\r
  grid-template-rows: 0fr;\r
  opacity: 0;\r
  transition: grid-template-rows 0.25s ease, opacity 0.2s ease, margin-top 0.25s ease;\r
}\r
.home-widget:hover .hover-reveal { grid-template-rows: 1fr; opacity: 1; margin-top: 4px; }\r
.home-root.editing .hover-reveal { grid-template-rows: 0fr; opacity: 0; margin-top: 0; }\r
.hover-reveal > * { overflow: hidden; min-height: 0; }\r
\r
.home-ghost {\r
  position: absolute;\r
  border: 1.5px dashed color-mix(in srgb, var(--home-accent) 70%, transparent);\r
  border-radius: 8px;\r
  background: color-mix(in srgb, var(--home-accent) 7%, transparent);\r
  display: none;\r
  z-index: 5;\r
  pointer-events: none;\r
  transition: left 0.18s ease, top 0.18s ease, width 0.18s ease, height 0.18s ease;\r
}\r
.home-ghost.visible { display: block; }\r
.home-ghost.swap {\r
  border-color: rgb(45 212 191 / 0.85);\r
  background: rgb(45 212 191 / 0.08);\r
}\r
\r
/* ── widget content primitives (responsive to the widget's own size) ── */\r
.home-widget .rows { column-gap: 18px; }\r
@container (min-width: 380px) {\r
  .home-widget .rows { columns: 2; column-rule: 1px solid rgb(255 255 255 / 0.06); }\r
}\r
@container (min-width: 600px) {\r
  .home-widget .rows { columns: 3; }\r
}\r
.home-widget .row {\r
  display: flex;\r
  justify-content: space-between;\r
  gap: 6px;\r
  padding: 1px 0;\r
  border-bottom: 1px solid rgb(255 255 255 / 0.04);\r
  break-inside: avoid;\r
}\r
.home-widget .row:last-child { border-bottom: none; }\r
/* Names flex and ellipsize at the real column width instead of a fixed\r
 * character slice that cut words mid-glyph ("bitacoras-guayab"). */\r
.home-widget .row > * { flex: none; }\r
.home-widget .row > .row-name {\r
  flex: 1 1 auto;\r
  min-width: 0;\r
  overflow: hidden;\r
  white-space: nowrap;\r
  text-overflow: ellipsis;\r
}\r
\r
.home-widget .meters { column-gap: 18px; }\r
@container (min-width: 380px) {\r
  .home-widget .meters { columns: 2; }\r
}\r
.home-widget .meter {\r
  display: flex;\r
  align-items: center;\r
  gap: 6px;\r
  margin: 3px 0;\r
  break-inside: avoid;\r
}\r
.home-widget .meter .lbl { width: 34px; color: var(--color-muted-foreground, #7d8496); font-size: 10px; }\r
.home-widget .meter .track {\r
  flex: 1;\r
  height: 7px;\r
  border-radius: 2px;\r
  background: rgb(255 255 255 / 0.07);\r
  overflow: hidden;\r
}\r
.home-widget .meter .fill {\r
  height: 100%;\r
  background: linear-gradient(90deg, var(--home-accent-dim), var(--home-accent));\r
  transition: width 0.6s ease;\r
}\r
.home-widget .meter .val { width: 44px; text-align: right; font-size: 10px; }\r
\r
.home-widget .ok { color: var(--home-accent); }\r
.home-widget .dim { color: var(--color-muted-foreground, #6b7387); }\r
.home-widget .bigval {\r
  font-size: min(9cqw, 18cqh);\r
  font-weight: 700;\r
  color: var(--home-accent);\r
}\r
\r
.home-clock-wrap {\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  height: calc(100% - 18px);\r
}\r
.home-clock {\r
  font-size: min(26cqw, 52cqh);\r
  font-weight: 800;\r
  color: var(--home-accent);\r
  letter-spacing: 0.02em;\r
  text-shadow: 0 0 24px color-mix(in srgb, var(--home-accent) 35%, transparent);\r
  line-height: 1;\r
}\r
.home-clock-ampm {\r
  font-size: 0.32em;\r
  vertical-align: 0.9em;\r
  margin-left: 0.2em;\r
  letter-spacing: 0.05em;\r
  color: var(--home-accent-dim);\r
}\r
.home-clock-sub {\r
  color: var(--home-accent-dim);\r
  font-size: max(9px, min(3.4cqw, 8cqh));\r
  letter-spacing: 0.14em;\r
  text-transform: uppercase;\r
  margin-top: 1cqh;\r
}\r
\r
.home-ascii-wrap {\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  height: calc(100% - 18px);\r
}\r
.home-ascii {\r
  font-size: min(5.6cqw, 5.4cqh);\r
  line-height: 1.05;\r
  white-space: pre;\r
  text-align: center;\r
  background: linear-gradient(\r
    180deg,\r
    var(--home-accent-dim),\r
    var(--home-accent) 40%,\r
    var(--home-accent) 60%,\r
    var(--home-accent-dim)\r
  );\r
  -webkit-background-clip: text;\r
  background-clip: text;\r
  color: transparent;\r
  filter: drop-shadow(0 0 10px color-mix(in srgb, var(--home-accent) 25%, transparent));\r
}\r
.home-ascii-caduceus {\r
  transform: scaleX(0.88);\r
  transform-origin: center;\r
}\r
.home-ascii-ver {\r
  text-align: center;\r
  color: var(--home-accent-soft);\r
  font-size: max(8px, min(2.6cqw, 5cqh));\r
  letter-spacing: 0.22em;\r
  margin-top: 1.5cqh;\r
}\r
\r
.home-spark {\r
  display: flex;\r
  align-items: flex-end;\r
  gap: 2px;\r
  height: max(18px, 22cqh);\r
  margin: 6px 0 4px;\r
}\r
.home-spark i {\r
  flex: 1;\r
  background: linear-gradient(180deg, var(--home-accent), var(--home-accent-dim));\r
  border-radius: 1px 1px 0 0;\r
  opacity: 0.85;\r
  transition: height 0.6s ease, opacity 0.15s ease;\r
  cursor: default;\r
}\r
.home-spark i:hover { opacity: 1; }\r
\r
/* Hover tooltip over a bar (tokens widget). Anchored to the bar via inline\r
 * \`left\` + \`translateX\`, which clamps it inside the clipped widget; the appear/\r
 * disappear slide+fade runs on the independent \`translate\` property so it never\r
 * fights the positioning transform. */\r
.home-spark-wrap { position: relative; }\r
.home-spark-tip {\r
  position: absolute;\r
  bottom: 100%;\r
  margin-bottom: 6px;\r
  padding: 3px 7px;\r
  border-radius: 6px;\r
  background: color-mix(in srgb, var(--home-accent) 10%, rgb(8 8 12 / 0.96));\r
  border: 1px solid var(--home-border);\r
  color: rgb(236 236 242);\r
  font-size: 10px;\r
  line-height: 1.3;\r
  white-space: nowrap;\r
  pointer-events: none;\r
  opacity: 0;\r
  translate: 0 4px;\r
  transition: opacity 0.18s ease, translate 0.18s ease, transform 0.18s ease;\r
  z-index: 6;\r
}\r
.home-spark-tip.show { opacity: 1; translate: 0 0; }\r
.home-spark-tip b { color: var(--home-accent); font-weight: 600; }\r
\r
/* Line/area chart (tokens widget, alternative to the bars). Stretched to fill\r
 * via preserveAspectRatio=none; the stroke stays crisp with non-scaling-stroke. */\r
.home-area {\r
  display: block;\r
  width: 100%;\r
  height: max(18px, 22cqh);\r
  margin: 6px 0 4px;\r
  overflow: visible;\r
}\r
.home-area rect { cursor: default; }\r
\r
/* Host graphs view: four live sparklines (cpu / ram / load / proc) in a 2×2\r
 * grid over a rolling one-minute window. Fills the widget below the header\r
 * (same absolute pattern as the canvas widgets); cells reuse .home-area but\r
 * stretch to their cell height instead of the tokens widget's fixed band. */\r
.host-sparks {\r
  position: absolute;\r
  inset: 30px 12px 10px;\r
  display: grid;\r
  grid-template-columns: 1fr 1fr;\r
  grid-template-rows: 1fr 1fr;\r
  gap: 4px 12px;\r
  min-height: 0;\r
}\r
.host-spark {\r
  display: flex;\r
  flex-direction: column;\r
  min-height: 0;\r
  min-width: 0;\r
}\r
.host-spark-head {\r
  display: flex;\r
  justify-content: space-between;\r
  align-items: baseline;\r
  font-size: max(8px, min(3.2cqw, 6cqh));\r
  letter-spacing: 0.14em;\r
  text-transform: uppercase;\r
}\r
.host-spark-head .val {\r
  font-variant-numeric: tabular-nums;\r
  color: var(--home-accent);\r
}\r
.host-spark .home-area {\r
  flex: 1;\r
  height: auto;\r
  min-height: 12px;\r
  margin: 2px 0 0;\r
}\r
\r
/* Small vertical divider between the range arrows and the toggles. */\r
.tok-div {\r
  width: 1px;\r
  align-self: stretch;\r
  margin: 2px 2px;\r
  background: var(--home-border);\r
}\r
\r
/* Totals line, regrouped: each label sticks to its value, groups spaced evenly\r
 * (the old \`.row\` space-between scattered the six tokens across the full width). */\r
.tok-stats {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 2px 14px;\r
  padding: 3px 0 1px;\r
  font-variant-numeric: tabular-nums;\r
}\r
.tok-stats > span { white-space: nowrap; }\r
.tok-stats .dim { margin-right: 2px; }\r
\r
/* ── logs widget (per-file record list) ── */\r
.logs-sub {\r
  display: flex;\r
  justify-content: space-between;\r
  align-items: baseline;\r
  gap: 8px;\r
}\r
.logs-file {\r
  font-size: 11px;\r
  font-weight: 600;\r
  letter-spacing: 0.06em;\r
  color: var(--home-accent);\r
}\r
/* The wrapper owns the widget's remaining height so the list scrolls inside it\r
 * instead of growing past the bottom edge (the old calc() resolved against an\r
 * auto-height parent and never clamped). */\r
.home-logs-wrap {\r
  display: flex;\r
  flex-direction: column;\r
  height: calc(100% - 21px);\r
  min-height: 0;\r
}\r
.home-logs {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 1px;\r
  flex: 1 1 0;\r
  min-height: 0;\r
  overflow-y: auto;\r
  margin-top: 3px;\r
  /* Rows that don't fit fade out instead of being sliced by the edge. */\r
  mask-image: linear-gradient(180deg, #000 calc(100% - 14px), transparent);\r
}\r
.log-row {\r
  display: flex;\r
  gap: 6px;\r
  align-items: baseline;\r
  padding: 1px 0;\r
  border-bottom: 1px solid rgb(255 255 255 / 0.04);\r
  cursor: default;\r
}\r
.log-row:last-child { border-bottom: none; }\r
.log-lvl {\r
  flex: none;\r
  width: 32px;\r
  font-size: 9px;\r
  font-weight: 600;\r
  letter-spacing: 0.03em;\r
}\r
.log-lvl.lvl-error { color: var(--home-error); }\r
.log-lvl.lvl-warn { color: #f5b945; }\r
.log-lvl.lvl-info { color: var(--color-muted-foreground, #6b7387); }\r
.log-time {\r
  flex: none;\r
  font-size: 9px;\r
  color: var(--color-muted-foreground, #6b7387);\r
  font-variant-numeric: tabular-nums;\r
}\r
.log-msg {\r
  flex: 1;\r
  min-width: 0;\r
  font-size: 10px;\r
  white-space: nowrap;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
}\r
\r
.home-matrix-c {\r
  position: absolute;\r
  inset: 0;\r
  top: 24px;\r
  width: 100%;\r
  height: calc(100% - 24px);\r
}\r
\r
/* ── notes widget ── */\r
.home-notes { display: flex; flex-direction: column; gap: 1px; height: calc(100% - 18px); overflow-y: auto; }\r
.home-notes .note-row {\r
  display: flex;\r
  align-items: baseline;\r
  gap: 7px;\r
  padding: 1px 0;\r
  border-bottom: 1px solid rgb(255 255 255 / 0.04);\r
}\r
.home-notes .note-mark {\r
  cursor: pointer;\r
  width: 12px;\r
  text-align: center;\r
  color: var(--home-accent);\r
  flex-shrink: 0;\r
}\r
.home-notes .note-mark.done { color: var(--color-muted-foreground, #6b7387); }\r
.home-notes .note-text { cursor: text; flex: 1; min-width: 0; overflow-wrap: anywhere; }\r
.home-notes .note-text.done {\r
  text-decoration: line-through;\r
  color: var(--color-muted-foreground, #6b7387);\r
}\r
.home-notes .note-input {\r
  flex: 1;\r
  min-width: 0;\r
  background: none;\r
  border: none;\r
  border-bottom: 1px dashed var(--home-border);\r
  outline: none;\r
  color: inherit;\r
  font: inherit;\r
  padding: 0;\r
}\r
.home-notes .note-add {\r
  align-self: flex-start;\r
  margin-top: 4px;\r
  background: none;\r
  border: none;\r
  cursor: pointer;\r
  color: var(--home-accent-dim);\r
  font-size: 14px;\r
  line-height: 1;\r
  padding: 2px 6px 2px 2px;\r
}\r
.home-notes .note-add:hover { color: var(--home-accent); }\r
\r
/* ── canvas widgets (heartbeat, life) ── */\r
.home-canvas {\r
  position: absolute;\r
  inset: 0;\r
  top: 24px;\r
  width: 100%;\r
  height: calc(100% - 24px);\r
}\r
/* Life is drawable in rest mode — signal it with a crosshair. */\r
.home-root:not(.editing) .home-life { cursor: crosshair; }\r
\r
/* ── moon ── */\r
.home-moon-wrap {\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  height: calc(100% - 18px);\r
}\r
.home-moon-c { flex: 1; width: 100%; min-height: 0; }\r
.home-moon-label {\r
  color: var(--home-accent-dim);\r
  font-size: max(8px, min(3cqw, 6cqh));\r
  letter-spacing: 0.14em;\r
  text-transform: uppercase;\r
}\r
\r
/* ── pomodoro / countdown ── */\r
.home-pomo .home-clock,\r
.home-count .home-clock { cursor: pointer; }\r
.home-pomo .home-clock.paused { opacity: 0.55; }\r
.home-pomo .pomo-sub { cursor: pointer; }\r
.home-count .count-label { cursor: pointer; }\r
.home-count .count-input,\r
.home-pomo .count-input { max-width: 92%; text-align: center; color-scheme: dark; }\r
\r
/* ── countdown segment editor (alarm-style spinners) ── */\r
.count-edit {\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 3px;\r
  height: calc(100% - 18px);\r
}\r
.count-edit-row { display: flex; align-items: center; gap: 5px; }\r
.count-seg { display: flex; flex-direction: column; align-items: center; }\r
.count-seg .seg-btn {\r
  background: none;\r
  border: none;\r
  cursor: pointer;\r
  padding: 0;\r
  line-height: 0.6;\r
  font-size: 8px;\r
  color: var(--home-accent-dim);\r
}\r
.count-seg .seg-btn:hover { color: var(--home-accent); }\r
.count-seg .seg-val {\r
  background: none;\r
  border: none;\r
  outline: none;\r
  text-align: center;\r
  color: var(--home-accent);\r
  font: inherit;\r
  font-weight: 800;\r
  font-size: max(12px, min(7cqw, 15cqh));\r
  padding: 1px 0;\r
  border-bottom: 1px solid transparent;\r
  letter-spacing: 0.02em;\r
}\r
.count-seg input.seg-val:focus { border-bottom-color: var(--home-accent); }\r
.count-seg .seg-static { cursor: default; }\r
.count-colon {\r
  font-weight: 800;\r
  color: var(--home-accent-dim);\r
  font-size: max(12px, min(7cqw, 15cqh));\r
}\r
.count-done {\r
  margin-top: 3px;\r
  background: none;\r
  border: 1px solid var(--home-border);\r
  border-radius: 6px;\r
  color: var(--home-accent);\r
  cursor: pointer;\r
  font: inherit;\r
  font-size: 10px;\r
  letter-spacing: 0.08em;\r
  text-transform: uppercase;\r
  padding: 2px 12px;\r
}\r
.count-done:hover { border-color: var(--home-accent); }\r
.home-pomo .pomo-min {\r
  font-size: min(20cqw, 40cqh);\r
  font-weight: 800;\r
  color: var(--home-accent);\r
  max-width: 70%;\r
}\r
/* Hover steppers for the pomodoro work/break lengths. */\r
.hover-ctl.pomo-set { flex-direction: column; align-items: flex-end; gap: 1px; }\r
.pomo-stepper { display: flex; align-items: center; gap: 3px; }\r
.pomo-stepper .hv-label:nth-child(3) { min-width: 16px; text-align: center; color: var(--home-accent); }\r
\r
/* ── calendar ── */\r
.home-cal { height: calc(100% - 18px); display: flex; flex-direction: column; }\r
.home-cal-month {\r
  text-align: center;\r
  color: var(--home-accent-dim);\r
  font-size: max(9px, min(3.2cqw, 7cqh));\r
  letter-spacing: 0.14em;\r
  text-transform: uppercase;\r
  margin-bottom: 4px;\r
}\r
.home-cal-grid {\r
  flex: 1;\r
  display: grid;\r
  grid-template-columns: repeat(7, 1fr);\r
  align-content: space-evenly;\r
  justify-items: center;\r
  font-size: max(8px, min(3cqw, 6.5cqh));\r
}\r
.home-cal-h { color: var(--color-muted-foreground, #6b7387); }\r
.home-cal-d { color: var(--color-foreground, #d8dce6); opacity: 0.75; }\r
.home-cal-today {\r
  color: #000;\r
  background: var(--home-accent);\r
  border-radius: 4px;\r
  padding: 0 4px;\r
  font-weight: 700;\r
}\r
/* Density tiers, chosen from the widget's cell width (see CalendarWidget). */\r
.home-cal.tier-mini .home-cal-month {\r
  font-size: max(8px, min(4cqw, 8cqh));\r
  margin-bottom: 2px;\r
}\r
.home-cal.tier-mini .home-cal-grid { font-size: max(9px, min(4cqw, 8cqh)); }\r
.home-cal.tier-large .home-cal-month {\r
  font-size: max(11px, min(3cqw, 7cqh));\r
  margin-bottom: 7px;\r
}\r
.home-cal.tier-large .home-cal-grid { row-gap: 3px; }\r
.home-cal.tier-large .home-cal-h { font-weight: 700; opacity: 0.8; }\r
.home-cal.tier-large .home-cal-today { padding: 1px 6px; }\r
\r
/* ── page chrome ── */\r
/* Edit affordance lives BELOW the grid, centered. It fades in once the user\r
 * starts scrolling down (or immediately when the grid is short enough that\r
 * there's nothing to scroll), keeping the home clean on first paint. While\r
 * editing it sticks to the bottom of the viewport so it stays reachable. */\r
.home-editbar {\r
  display: flex;\r
  justify-content: center;\r
  gap: 10px;\r
  padding: 22px 12px 30px;\r
  opacity: 0;\r
  transition: opacity 0.25s ease;\r
  pointer-events: none;\r
}\r
.home-editbar.visible {\r
  opacity: 1;\r
  pointer-events: auto;\r
}\r
.home-root.editing .home-editbar {\r
  position: sticky;\r
  bottom: 0;\r
}\r
.home-fab {\r
  position: relative;\r
  width: 38px;\r
  height: 38px;\r
  border-radius: 50%;\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  font-size: 15px;\r
  cursor: pointer;\r
  color: var(--home-accent);\r
  background: var(--home-surface);\r
  border: 1px solid var(--home-border);\r
  backdrop-filter: blur(12px);\r
  -webkit-backdrop-filter: blur(12px);\r
  transition:\r
    border-color 0.25s ease,\r
    background 0.35s ease,\r
    box-shadow 0.45s ease,\r
    transform 0.4s cubic-bezier(0.34, 1.4, 0.64, 1);\r
}\r
.home-fab:hover {\r
  border-color: var(--home-accent);\r
  transform: scale(1.06);\r
}\r
.home-fab:active { transform: scale(0.94); }\r
.home-fab.active {\r
  background: color-mix(in srgb, var(--home-accent) 22%, transparent);\r
  /* Warm Hermes glow ring when edit mode engages. */\r
  animation: home-fab-glow 0.55s ease-out;\r
}\r
\r
/* Crossfading edit ✎ ↔ done ✓ glyphs — each rotates and scales through the\r
 * swap with a gentle overshoot, matching the dashboard's soft motion. */\r
.home-fab-ico {\r
  position: absolute;\r
  inset: 0;\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  transition:\r
    opacity 0.3s ease,\r
    transform 0.45s cubic-bezier(0.34, 1.45, 0.64, 1);\r
}\r
.ico-edit { opacity: 1; transform: rotate(0) scale(1); }\r
.ico-done { opacity: 0; transform: rotate(-120deg) scale(0.3); }\r
.home-fab.active .ico-edit { opacity: 0; transform: rotate(120deg) scale(0.3); }\r
.home-fab.active .ico-done { opacity: 1; transform: rotate(0) scale(1); }\r
\r
.home-fab-spin {\r
  display: inline-block;\r
  animation: home-fab-spin-in 0.5s cubic-bezier(0.34, 1.4, 0.64, 1);\r
}\r
\r
/* The restore-default button slides up into place, like the dashboard's\r
 * dialog-in entrance. */\r
.home-fab-enter {\r
  animation: home-fab-enter 0.32s cubic-bezier(0.34, 1.3, 0.64, 1);\r
}\r
\r
@keyframes home-fab-glow {\r
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--home-accent) 55%, transparent); }\r
  100% { box-shadow: 0 0 0 13px transparent; }\r
}\r
@keyframes home-fab-spin-in {\r
  from { transform: rotate(-150deg); opacity: 0.3; }\r
  to   { transform: rotate(0); opacity: 1; }\r
}\r
@keyframes home-fab-enter {\r
  from { opacity: 0; transform: translateY(6px) scale(0.9); }\r
  to   { opacity: 1; transform: translateY(0) scale(1); }\r
}\r
\r
@media (prefers-reduced-motion: reduce) {\r
  .home-fab,\r
  .home-fab-ico,\r
  .home-fab-spin,\r
  .home-fab-enter { animation: none; transition: opacity 0.2s ease; }\r
}\r
\r
/* ── toast (plugin-local; the host toast isn't exposed in the SDK) ── */\r
.home-toast {\r
  position: fixed;\r
  bottom: 18px;\r
  left: 50%;\r
  transform: translateX(-50%);\r
  z-index: 80;\r
  padding: 8px 16px;\r
  border-radius: 8px;\r
  font-size: 12px;\r
  color: var(--home-error, #e25555);\r
  background: var(--home-surface);\r
  border: 1px solid var(--home-error, #e25555);\r
  backdrop-filter: blur(12px);\r
  -webkit-backdrop-filter: blur(12px);\r
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);\r
  animation: home-toast-in 0.25s ease;\r
}\r
@keyframes home-toast-in {\r
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }\r
  to { opacity: 1; transform: translateX(-50%) translateY(0); }\r
}\r
\r
/* Catalog reveal: the wrapper animates its row track 0fr → 1fr so the panel\r
 * grows/collapses its real height smoothly (no grid jump), with a matching\r
 * fade. Kept mounted so the exit animates too. */\r
.home-catalog-wrap {\r
  display: grid;\r
  grid-template-rows: 0fr;\r
  margin: 0 12px;\r
  opacity: 0;\r
  pointer-events: none;\r
  transition:\r
    grid-template-rows 0.34s cubic-bezier(0.34, 1.2, 0.64, 1),\r
    opacity 0.28s ease,\r
    margin-bottom 0.34s ease;\r
}\r
.home-catalog-wrap.open {\r
  grid-template-rows: 1fr;\r
  opacity: 1;\r
  pointer-events: auto;\r
  margin-bottom: 8px;\r
}\r
.home-catalog {\r
  overflow: hidden;\r
  min-height: 0;\r
  border-radius: 8px;\r
  background: var(--home-surface);\r
  border: 1px solid var(--home-border);\r
  backdrop-filter: blur(12px);\r
  -webkit-backdrop-filter: blur(12px);\r
  transition: border-color 0.2s ease, background 0.2s ease;\r
}\r
/* Highlighted as a delete target while a widget is dragged over it. */\r
.home-catalog-wrap.trash-active .home-catalog {\r
  border-color: var(--home-error);\r
  border-style: dashed;\r
  background: color-mix(in srgb, var(--home-error) 10%, var(--home-surface));\r
}\r
.home-catalog-inner {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: center;\r
  gap: 8px;\r
  padding: 10px;\r
}\r
.home-catalog-hint {\r
  font-size: 10px;\r
  letter-spacing: 0.04em;\r
  color: var(--color-muted-foreground, #6b7387);\r
  margin-right: 4px;\r
}\r
.home-catalog-wrap.trash-active .home-catalog-hint { color: var(--home-error); }\r
.home-catalog-chip { touch-action: none; }\r
.home-catalog-chip {\r
  font-family: inherit;\r
  font-size: 11px;\r
  padding: 4px 10px;\r
  border-radius: 6px;\r
  cursor: pointer;\r
  background: none;\r
  border: 1px dashed var(--home-border);\r
  color: var(--color-foreground, #d8dce6);\r
  transition: border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;\r
}\r
.home-catalog-chip:hover {\r
  border-color: var(--home-accent);\r
  color: var(--home-accent);\r
  transform: translateY(-1px);\r
}\r
.home-catalog-chip:active { transform: scale(0.95); }\r
.home-catalog .empty { color: var(--color-muted-foreground, #6b7387); font-size: 11px; }\r
\r
@media (prefers-reduced-motion: reduce) {\r
  .home-catalog-wrap { transition: opacity 0.2s ease; }\r
}\r
\r
/* ── Agent widget (the eye) ─────────────────────────────────────────── */\r
\r
.home-agent {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 6px;\r
  /* The .hd header sits above in the same content box (same as the other\r
   * widgets' calc) — 100% pushed the stats row 8px past the bottom edge. */\r
  height: calc(100% - 21px);\r
  min-height: 0;\r
  overflow: hidden;\r
  font-size: 11px;\r
  box-sizing: border-box;\r
}\r
\r
/* The animated scene owns the leftover space and centers its content\r
 * vertically; head/stats/history are fixed rows that never move or\r
 * overflow. flex-basis: 0 — the scene shrinks to zero before the fixed\r
 * rows are ever pushed out. */\r
.home-agent-scene {\r
  flex: 1 1 0;\r
  min-height: 0;\r
  display: flex;\r
  align-items: center;\r
  overflow: hidden;\r
}\r
\r
.home-agent-head {\r
  display: flex;\r
  align-items: center;\r
  gap: 6px;\r
  flex-wrap: wrap;\r
  min-height: 18px;\r
  flex: none;\r
}\r
\r
.home-agent-dot {\r
  width: 8px;\r
  height: 8px;\r
  border-radius: 50%;\r
  background: var(--home-accent);\r
  opacity: 0.45;\r
  flex: none;\r
  box-shadow: 0 0 6px var(--home-accent);\r
}\r
.home-agent-dot.busy {\r
  opacity: 1;\r
  animation: home-agent-pulse 1.2s ease-in-out infinite;\r
}\r
@keyframes home-agent-pulse {\r
  0%, 100% { opacity: 1; transform: scale(1); }\r
  50% { opacity: 0.35; transform: scale(0.8); }\r
}\r
\r
.home-agent-status {\r
  text-transform: uppercase;\r
  letter-spacing: 0.08em;\r
  font-size: 10px;\r
  color: var(--color-foreground, #d8dce6);\r
}\r
\r
.home-agent-take {\r
  background: none;\r
  border: none;\r
  cursor: pointer;\r
  font-family: inherit;\r
  font-size: 9px;\r
  letter-spacing: 0.08em;\r
  text-transform: uppercase;\r
  color: var(--home-accent-dim);\r
  display: inline-flex;\r
  align-items: center;\r
  gap: 5px;\r
  padding: 1px 5px;\r
  border-radius: 4px;\r
  white-space: nowrap;\r
}\r
.home-agent-take:hover { color: var(--home-accent); background: color-mix(in srgb, var(--home-accent) 10%, transparent); }\r
.home-agent-take:active { transform: scale(0.95); }\r
\r
/* Play triangle, pure CSS — no emoji. */\r
.home-agent-take-ico {\r
  width: 0;\r
  height: 0;\r
  border-left: 4.5px solid currentColor;\r
  border-top: 3px solid transparent;\r
  border-bottom: 3px solid transparent;\r
}\r
\r
.home-agent-line {\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
  min-width: 0;\r
}\r
\r
.home-agent-toolbox {\r
  display: flex;\r
  gap: 6px;\r
  align-items: baseline;\r
}\r
.home-agent-k {\r
  color: var(--home-accent);\r
  flex: none;\r
}\r
.home-agent-dim { color: var(--color-muted-foreground, #6b7387); }\r
\r
.home-agent-msg {\r
  color: var(--color-muted-foreground, #8b93a7);\r
  font-style: italic;\r
  max-height: 42px;\r
  white-space: normal;\r
  overflow: hidden;\r
  display: -webkit-box;\r
  -webkit-line-clamp: 2;\r
  -webkit-box-orient: vertical;\r
}\r
\r
.home-agent-stats {\r
  display: flex;\r
  gap: 10px;\r
  flex-wrap: wrap;\r
  font-size: 10px;\r
  color: var(--color-foreground, #d8dce6);\r
  border-top: 1px solid var(--home-border);\r
  padding-top: 5px;\r
  /* Shrinkable last: the scene compresses first (flex-basis 0), then this\r
     row and the history may compress instead of overflowing the widget. */\r
  flex: 0 1 auto;\r
  min-height: 0;\r
  overflow: hidden;\r
}\r
.home-agent-stats span {\r
  white-space: nowrap;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  min-width: 0;\r
}\r
.home-agent-stats i {\r
  font-style: normal;\r
  color: var(--color-muted-foreground, #6b7387);\r
  font-size: 9px;\r
}\r
\r
.home-agent-history {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 4px 10px;\r
  max-height: 40px;\r
  overflow: hidden;\r
  flex: 0 1 auto;\r
  min-height: 0;\r
}\r
.home-agent-hist {\r
  font-size: 10px;\r
  color: var(--color-muted-foreground, #8b93a7);\r
  display: inline-flex;\r
  gap: 4px;\r
  align-items: center;\r
}\r
.home-agent-hist-dot {\r
  width: 5px;\r
  height: 5px;\r
  border-radius: 50%;\r
  flex: none;\r
}\r
.home-agent-hist-dot.ok { background: #2dd4bf; }\r
.home-agent-hist-dot.bad { background: var(--home-error); }\r
.home-agent-hist i {\r
  font-style: normal;\r
  font-size: 9px;\r
  color: var(--color-muted-foreground, #6b7387);\r
}\r
\r
/* ── Agent theater (take-control fullscreen) ───────────────────────── */\r
\r
.home-theater {\r
  position: fixed;\r
  inset: 0;\r
  z-index: 1000;\r
  background: color-mix(in srgb, var(--ui-editor-surface-background, rgb(8 8 12 / 1)) 92%, #000);\r
  backdrop-filter: blur(18px);\r
  -webkit-backdrop-filter: blur(18px);\r
  display: flex;\r
  flex-direction: column;\r
  padding: 18px 22px 22px;\r
  gap: 14px;\r
  overflow: auto;\r
  font-family: var(--theme-font-mono, ui-monospace, monospace);\r
  color: var(--color-foreground, #d8dce6);\r
  animation: home-theater-in 0.22s ease;\r
}\r
@keyframes home-theater-in {\r
  from { opacity: 0; transform: scale(0.985); }\r
  to { opacity: 1; transform: scale(1); }\r
}\r
\r
.home-theater-head {\r
  display: flex;\r
  align-items: center;\r
  gap: 10px;\r
  border-bottom: 1px solid var(--home-border);\r
  padding-bottom: 10px;\r
  flex: none;\r
}\r
\r
.home-theater-title {\r
  font-size: 13px;\r
  letter-spacing: 0.14em;\r
  color: var(--home-accent);\r
}\r
\r
.home-theater-sub {\r
  font-size: 10px;\r
  color: var(--color-muted-foreground, #6b7387);\r
  text-transform: uppercase;\r
  letter-spacing: 0.06em;\r
}\r
\r
.home-theater-release {\r
  margin-left: auto;\r
  background: transparent;\r
  border: 1px solid var(--home-border);\r
  color: var(--color-foreground, #d8dce6);\r
  border-radius: 6px;\r
  font-size: 11px;\r
  font-family: inherit;\r
  padding: 4px 12px;\r
  cursor: pointer;\r
  transition: border-color 0.15s ease, color 0.15s ease;\r
}\r
.home-theater-release:hover {\r
  border-color: var(--home-error);\r
  color: var(--home-error);\r
}\r
\r
.home-theater-grid {\r
  display: grid;\r
  grid-template-columns: repeat(12, 1fr);\r
  gap: 12px;\r
  flex: 1;\r
  min-height: 0;\r
  align-content: start;\r
}\r
.home-theater-span-5 { grid-column: span 5; }\r
.home-theater-span-7 { grid-column: span 7; }\r
.home-theater-span-12 { grid-column: span 12; }\r
@media (max-width: 900px) {\r
  .home-theater-span-5, .home-theater-span-7, .home-theater-span-12 { grid-column: span 12; }\r
}\r
\r
.home-theater-panel {\r
  background: var(--home-surface);\r
  border: 1px solid var(--home-border);\r
  border-radius: 10px;\r
  padding: 12px 14px;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 8px;\r
  min-height: 160px;\r
  max-height: 420px;\r
  overflow: hidden;\r
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.35);\r
}\r
\r
.home-theater-panel-title {\r
  font-size: 10px;\r
  letter-spacing: 0.12em;\r
  color: var(--color-muted-foreground, #6b7387);\r
  display: flex;\r
  align-items: center;\r
  gap: 7px;\r
  flex: none;\r
  text-transform: uppercase;\r
}\r
.home-theater-dim {\r
  color: var(--color-muted-foreground, #6b7387);\r
  font-size: 10px;\r
  font-style: italic;\r
}\r
\r
/* NOW panel */\r
.home-theater-current-tool {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 3px;\r
  background: color-mix(in srgb, var(--home-accent) 8%, transparent);\r
  border: 1px solid var(--home-border);\r
  border-radius: 8px;\r
  padding: 8px 10px;\r
  flex: none;\r
}\r
.home-theater-ct-name {\r
  color: var(--home-accent);\r
  font-size: 12px;\r
}\r
.home-theater-ct-args {\r
  font-size: 10px;\r
  color: var(--color-muted-foreground, #8b93a7);\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.home-theater-stream {\r
  font-size: 11px;\r
  line-height: 1.55;\r
  color: var(--color-foreground, #d8dce6);\r
  background: color-mix(in srgb, var(--home-accent) 4%, transparent);\r
  border-left: 2px solid var(--home-accent);\r
  padding: 6px 10px;\r
  border-radius: 0 6px 6px 0;\r
  max-height: 110px;\r
  overflow: auto;\r
  flex: none;\r
  white-space: pre-wrap;\r
  word-break: break-word;\r
}\r
\r
.home-theater-feed {\r
  flex: 1;\r
  min-height: 0;\r
  overflow: auto;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 2px;\r
  font-size: 10.5px;\r
}\r
.home-theater-feed-row {\r
  display: flex;\r
  gap: 8px;\r
  align-items: baseline;\r
  padding: 1px 0;\r
  border-bottom: 1px solid color-mix(in srgb, var(--home-border) 40%, transparent);\r
  animation: home-feed-in 0.32s ease-out both;\r
}\r
.home-theater-feed-time {\r
  color: var(--color-muted-foreground, #555d70);\r
  flex: none;\r
  font-size: 9.5px;\r
}\r
/* Kind dot, pure CSS — no emoji. */\r
.home-theater-feed-kind {\r
  flex: none;\r
  width: 6px;\r
  height: 6px;\r
  border-radius: 50%;\r
  align-self: center;\r
}\r
.home-theater-feed-kind.tool { background: var(--home-accent); }\r
.home-theater-feed-kind.message { background: #2dd4bf; }\r
.home-theater-feed-kind.subagent { background: #a78bfa; }\r
.home-theater-feed-kind.system { background: var(--color-muted-foreground, #6b7387); }\r
.home-theater-feed-kind.bad { background: var(--home-error); }\r
.home-theater-feed-label {\r
  color: var(--color-foreground, #d8dce6);\r
  flex: none;\r
}\r
.home-theater-feed-detail {\r
  color: var(--color-muted-foreground, #8b93a7);\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
  min-width: 0;\r
}\r
\r
.home-theater-foot {\r
  display: flex;\r
  gap: 14px;\r
  font-size: 9.5px;\r
  color: var(--color-muted-foreground, #555d70);\r
  text-transform: uppercase;\r
  letter-spacing: 0.06em;\r
  flex: none;\r
  border-top: 1px solid var(--home-border);\r
  padding-top: 6px;\r
}\r
\r
/* FUNCTION panel */\r
.home-theater-fn-current {\r
  background: color-mix(in srgb, var(--home-accent) 8%, transparent);\r
  border: 1px solid var(--home-border);\r
  border-radius: 8px;\r
  padding: 8px 10px;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 6px;\r
  flex: none;\r
}\r
.home-theater-fn-name {\r
  display: flex;\r
  align-items: center;\r
  gap: 8px;\r
  font-size: 12px;\r
  color: var(--home-accent);\r
}\r
.home-theater-fn-dot {\r
  width: 6px;\r
  height: 6px;\r
  border-radius: 50%;\r
  flex: none;\r
}\r
.home-theater-fn-dot.running {\r
  background: var(--home-accent);\r
  animation: home-agent-pulse 1.2s ease-in-out infinite;\r
}\r
.home-theater-fn-dot.ok { background: #2dd4bf; }\r
.home-theater-fn-dot.bad { background: var(--home-error); }\r
.home-theater-fn-state {\r
  margin-left: auto;\r
  font-size: 9px;\r
  text-transform: uppercase;\r
  letter-spacing: 0.08em;\r
  padding: 1px 8px;\r
  border-radius: 20px;\r
  border: 1px solid;\r
}\r
.home-theater-fn-state.running {\r
  color: var(--home-accent);\r
  border-color: var(--home-accent);\r
}\r
.home-theater-fn-args {\r
  font-size: 10px;\r
  color: var(--color-muted-foreground, #8b93a7);\r
  white-space: pre-wrap;\r
  word-break: break-word;\r
  max-height: 120px;\r
  overflow: auto;\r
  margin: 0;\r
  font-family: inherit;\r
}\r
\r
.home-theater-fn-history {\r
  flex: 1;\r
  min-height: 0;\r
  overflow: auto;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 2px;\r
  font-size: 10.5px;\r
}\r
.home-theater-fn-row {\r
  display: flex;\r
  gap: 8px;\r
  align-items: baseline;\r
  border-bottom: 1px solid color-mix(in srgb, var(--home-border) 40%, transparent);\r
  padding: 2px 0;\r
}\r
.home-theater-fn-hname { color: var(--color-foreground, #d8dce6); flex: none; }\r
.home-theater-fn-hargs {\r
  color: var(--color-muted-foreground, #8b93a7);\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
  min-width: 0;\r
}\r
.home-theater-fn-hdur {\r
  margin-left: auto;\r
  color: var(--color-muted-foreground, #6b7387);\r
  flex: none;\r
  font-size: 9.5px;\r
}\r
\r
/* TOKENS & COST panel */\r
.home-theater-tok-grid {\r
  display: grid;\r
  grid-template-columns: repeat(2, 1fr);\r
  gap: 8px;\r
}\r
.home-theater-tok-cell {\r
  background: color-mix(in srgb, var(--home-accent) 5%, transparent);\r
  border: 1px solid var(--home-border);\r
  border-radius: 8px;\r
  padding: 8px 10px;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 2px;\r
  min-width: 0;\r
  overflow: hidden;\r
}\r
.home-theater-tok-num {\r
  font-size: 15px;\r
  color: var(--color-foreground, #d8dce6);\r
  white-space: nowrap;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
}\r
.home-theater-tok-num.home-theater-money { color: var(--home-accent); }\r
.home-theater-tok-lbl {\r
  font-size: 9px;\r
  text-transform: uppercase;\r
  letter-spacing: 0.07em;\r
  color: var(--color-muted-foreground, #6b7387);\r
}\r
\r
.home-theater-tok-models {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 3px;\r
  font-size: 10px;\r
  border-top: 1px solid var(--home-border);\r
  padding-top: 6px;\r
}\r
.home-theater-tok-model {\r
  display: flex;\r
  gap: 10px;\r
  align-items: baseline;\r
}\r
.home-theater-tok-mname { color: var(--color-foreground, #d8dce6); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\r
.home-theater-tok-mtok { color: var(--color-muted-foreground, #8b93a7); margin-left: auto; }\r
.home-theater-tok-mcost { color: var(--home-accent); flex: none; }\r
\r
.home-theater-tok-session {\r
  border-top: 1px solid var(--home-border);\r
  padding-top: 6px;\r
  font-size: 10px;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 2px;\r
  min-width: 0;\r
}\r
.home-theater-tok-slbl {\r
  font-size: 9px;\r
  text-transform: uppercase;\r
  letter-spacing: 0.07em;\r
  color: var(--color-muted-foreground, #6b7387);\r
}\r
.home-theater-tok-stitle {\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
.home-theater-tok-snum {\r
  color: var(--color-muted-foreground, #8b93a7);\r
  white-space: nowrap;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
}\r
\r
/* PROJECT panel */\r
.home-theater-proj-session {\r
  background: color-mix(in srgb, var(--home-accent) 5%, transparent);\r
  border: 1px solid var(--home-border);\r
  border-radius: 8px;\r
  padding: 8px 10px;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 2px;\r
}\r
.home-theater-proj-title { font-size: 12px; color: var(--color-foreground, #d8dce6); }\r
.home-theater-proj-meta {\r
  font-size: 9.5px;\r
  color: var(--color-muted-foreground, #6b7387);\r
}\r
\r
.home-theater-proj-files {\r
  flex: 1;\r
  min-height: 0;\r
  overflow: auto;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 2px;\r
  font-size: 10.5px;\r
}\r
.home-theater-proj-file {\r
  display: flex;\r
  gap: 8px;\r
  align-items: baseline;\r
  border-bottom: 1px solid color-mix(in srgb, var(--home-border) 40%, transparent);\r
  padding: 2px 0;\r
}\r
.home-theater-proj-glyph {\r
  color: var(--home-accent);\r
  flex: none;\r
  font-size: 9px;\r
  width: 16px;\r
  text-align: center;\r
}\r
.home-theater-proj-path {\r
  color: var(--color-muted-foreground, #8b93a7);\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.home-theater-proj-subagents {\r
  border-top: 1px solid var(--home-border);\r
  padding-top: 6px;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 3px;\r
  font-size: 10px;\r
}\r
.home-theater-proj-subagent { display: flex; gap: 8px; align-items: baseline; }\r
.home-theater-proj-subdot {\r
  width: 6px;\r
  height: 6px;\r
  border-radius: 50%;\r
  flex: none;\r
  align-self: center;\r
}\r
.home-theater-proj-subdot.run { background: var(--home-accent); animation: home-agent-pulse 1.2s ease-in-out infinite; }\r
.home-theater-proj-subdot.done { background: #2dd4bf; }\r
.home-theater-proj-subname { color: var(--color-foreground, #d8dce6); }\r
.home-theater-proj-subgoal {\r
  color: var(--color-muted-foreground, #6b7387);\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
/* RECOMMENDATIONS panel */\r
.home-theater-rec-list {\r
  flex: 1;\r
  min-height: 0;\r
  overflow: auto;\r
  display: flex;\r
  flex-direction: column;\r
  gap: 6px;\r
}\r
.home-theater-rec {\r
  display: flex;\r
  gap: 10px;\r
  align-items: flex-start;\r
  border: 1px solid var(--home-border);\r
  border-radius: 8px;\r
  padding: 7px 10px;\r
  background: color-mix(in srgb, var(--home-surface) 60%, transparent);\r
}\r
.home-theater-rec.warn { border-color: color-mix(in srgb, #e8b33c 45%, transparent); }\r
.home-theater-rec.crit { border-color: color-mix(in srgb, var(--home-error) 55%, transparent); }\r
.home-theater-rec-tag {\r
  flex: none;\r
  width: 18px;\r
  height: 18px;\r
  border-radius: 50%;\r
  display: grid;\r
  place-items: center;\r
  font-size: 10px;\r
  margin-top: 1px;\r
}\r
.home-theater-rec.info .home-theater-rec-tag {\r
  color: var(--home-accent);\r
  border: 1px solid var(--home-accent);\r
}\r
.home-theater-rec.warn .home-theater-rec-tag {\r
  color: #e8b33c;\r
  border: 1px solid #e8b33c;\r
}\r
.home-theater-rec.crit .home-theater-rec-tag {\r
  color: var(--home-error);\r
  border: 1px solid var(--home-error);\r
}\r
.home-theater-rec-body { min-width: 0; }\r
.home-theater-rec-title { font-size: 11px; color: var(--color-foreground, #d8dce6); }\r
.home-theater-rec-detail {\r
  font-size: 10px;\r
  color: var(--color-muted-foreground, #8b93a7);\r
  margin-top: 1px;\r
}\r
\r
/* ── Live scene — the animated centerpiece ────────────────────────────\r
 * On identity change: the outgoing content slides up while fading, the\r
 * incoming content rises from below with a blur that dissolves as it\r
 * settles. */\r
\r
.home-theater-scene {\r
  flex: 1 1 auto;\r
  min-height: 0;\r
  display: flex;\r
  align-items: center;\r
  overflow: hidden;\r
}\r
\r
.home-scene {\r
  position: relative;\r
  width: 100%;\r
}\r
\r
.home-scene-item {\r
  animation: home-scene-in 0.42s ease-out both;\r
}\r
\r
.home-scene-item.leaving {\r
  position: absolute;\r
  inset-inline: 0;\r
  top: 0;\r
  animation: home-scene-out 0.4s ease-in forwards;\r
  pointer-events: none;\r
}\r
\r
@keyframes home-scene-in {\r
  from {\r
    opacity: 0;\r
    transform: translateY(26px);\r
    filter: blur(6px);\r
  }\r
  to {\r
    opacity: 1;\r
    transform: translateY(0);\r
    filter: blur(0);\r
  }\r
}\r
\r
@keyframes home-scene-out {\r
  from {\r
    opacity: 1;\r
    transform: translateY(0);\r
    filter: blur(0);\r
  }\r
  to {\r
    opacity: 0;\r
    transform: translateY(-26px);\r
    filter: blur(4px);\r
  }\r
}\r
\r
@keyframes home-feed-in {\r
  from { opacity: 0; transform: translateY(7px); }\r
  to { opacity: 1; transform: translateY(0); }\r
}\r
\r
@keyframes home-caret-blink {\r
  0%, 45% { opacity: 1; }\r
  50%, 100% { opacity: 0; }\r
}\r
\r
/* Scene content — tool call */\r
.home-scene-tool {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 4px;\r
  min-width: 0;\r
}\r
.home-scene-title {\r
  color: var(--home-accent);\r
  font-size: 12px;\r
  font-weight: 600;\r
  overflow: hidden;\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
.home-scene-meta {\r
  font-size: 9px;\r
  text-transform: uppercase;\r
  letter-spacing: 0.08em;\r
  color: var(--color-muted-foreground, #6b7387);\r
}\r
.home-scene-args {\r
  margin: 0;\r
  font-family: inherit;\r
  font-size: 10px;\r
  color: var(--color-muted-foreground, #8b93a7);\r
  white-space: pre-wrap;\r
  word-break: break-word;\r
  max-height: 90px;\r
  overflow: auto;\r
}\r
\r
/* Scene content — message (markdown-rendered) */\r
.home-scene-msg {\r
  font-size: 11.5px;\r
  line-height: 1.6;\r
  color: var(--color-foreground, #d8dce6);\r
  word-break: break-word;\r
  max-height: 150px;\r
  overflow: auto;\r
}\r
.home-scene-msg strong {\r
  color: var(--home-accent);\r
  font-weight: 650;\r
}\r
.home-scene-msg em { font-style: italic; }\r
.home-scene-msg code {\r
  font-family: var(--theme-font-mono, ui-monospace, monospace);\r
  font-size: 0.92em;\r
  color: var(--home-accent);\r
  background: color-mix(in srgb, var(--home-accent) 10%, transparent);\r
  padding: 0 4px;\r
  border-radius: 4px;\r
  white-space: pre-wrap;\r
}\r
.home-scene-msg .home-md-pre {\r
  margin: 4px 0;\r
  background: color-mix(in srgb, var(--home-accent) 5%, transparent);\r
  border: 1px solid var(--home-border);\r
  border-left: 2px solid var(--home-accent);\r
  border-radius: 0 6px 6px 0;\r
  padding: 6px 10px;\r
  overflow: auto;\r
  max-height: 120px;\r
}\r
.home-scene-msg .home-md-pre code {\r
  background: none;\r
  padding: 0;\r
  color: var(--color-muted-foreground, #9aa3b8);\r
  font-size: 10px;\r
  line-height: 1.5;\r
  white-space: pre;\r
}\r
.home-scene-msg .home-md-h {\r
  color: var(--home-accent);\r
  font-weight: 650;\r
  margin: 3px 0 1px;\r
}\r
.home-scene-msg .home-md-h.h1 { font-size: 13px; letter-spacing: 0.02em; }\r
.home-scene-msg .home-md-h.h2 { font-size: 12px; }\r
.home-scene-msg .home-md-h.h3 { font-size: 11px; }\r
.home-scene-msg .home-md-p { margin: 2px 0; }\r
.home-scene-msg .home-md-gap { height: 4px; }\r
.home-scene-msg .home-md-list { margin: 2px 0; display: flex; flex-direction: column; gap: 1px; }\r
.home-scene-msg .home-md-li {\r
  padding-left: 14px;\r
  position: relative;\r
}\r
.home-scene-msg .home-md-li::before {\r
  content: "";\r
  position: absolute;\r
  left: 3px;\r
  top: 0.62em;\r
  width: 5px;\r
  height: 5px;\r
  border-radius: 50%;\r
  background: var(--home-accent);\r
  opacity: 0.8;\r
}\r
.home-scene-caret {\r
  display: inline-block;\r
  width: 6px;\r
  height: 13px;\r
  margin-left: 2px;\r
  vertical-align: -2px;\r
  background: var(--home-accent);\r
  animation: home-caret-blink 1s steps(1) infinite;\r
}\r
\r
/* Scene content — idle */\r
.home-scene-idle {\r
  font-size: 10px;\r
  font-style: italic;\r
  color: var(--color-muted-foreground, #6b7387);\r
}\r
\r
/* Compact scene (widget body) */\r
.home-agent-scene .home-scene {\r
  display: flex;\r
  min-height: 0;\r
  overflow: hidden;\r
}\r
.home-agent-scene .home-scene-item {\r
  min-width: 0;\r
  min-height: 0;\r
  flex: 1;\r
}\r
.home-agent-scene .home-scene-msg {\r
  font-size: 10.5px;\r
  max-height: 64px;\r
  overflow: hidden;\r
}\r
.home-agent-scene .home-scene-tool {\r
  gap: 2px;\r
}\r
.home-agent-scene .home-scene-title {\r
  font-size: 11px;\r
}\r
.home-agent-scene .home-scene-args {\r
  font-size: 10px;\r
  max-height: 36px;\r
  white-space: nowrap;\r
  text-overflow: ellipsis;\r
  overflow: hidden;\r
}\r
.home-agent-scene .home-scene-meta,\r
.home-agent-scene .home-scene-idle {\r
  font-size: 9.5px;\r
}\r
`;
const HOME_DESKTOP_PATH = "/home";
const DESKTOP_START_KEY = "home-dashboard.opened-this-start";
function createHomeContributions(render, navigate = () => void 0) {
  return [
    {
      id: "page",
      area: "routes",
      title: "Home",
      order: -1e3,
      data: { path: HOME_DESKTOP_PATH },
      render
    },
    {
      id: "nav",
      area: "sidebar.nav",
      order: -1e3,
      data: { path: HOME_DESKTOP_PATH, label: "Home", codicon: "home" }
    },
    {
      id: "open",
      area: "palette",
      order: -1e3,
      data: {
        id: "home.open",
        label: "Open Home",
        keywords: ["home", "dashboard", "widgets"],
        run: () => navigate(HOME_DESKTOP_PATH)
      }
    }
  ];
}
function isAuxiliaryDesktopWindow(search) {
  try {
    return new URLSearchParams(search).has("win");
  } catch {
    return false;
  }
}
function openHomeOnDesktopStart(storage, navigate, search = "") {
  if (isAuxiliaryDesktopWindow(search)) {
    return false;
  }
  if (storage.getItem(DESKTOP_START_KEY) === "1") {
    return false;
  }
  storage.setItem(DESKTOP_START_KEY, "1");
  navigate(HOME_DESKTOP_PATH);
  return true;
}
const PLUGIN_API_PREFIX = "/api/plugins/home-dashboard";
function query(path, params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== void 0) search.set(key, String(value));
  });
  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
}
function desktopRoute(path) {
  const routes = {
    "/system": "/command-center?section=system",
    "/sessions": "/",
    "/cron": "/cron",
    "/logs": "/command-center?section=logs"
  };
  return routes[path] ?? path;
}
function createDesktopHomeHost(ctx, desktop) {
  const api2 = {
    getStatus: () => desktop.status(),
    getSystemStats: () => ctx.rest("/system"),
    getAnalytics: (days) => ctx.rest(query("/analytics", { days })),
    getCronJobs: (profile) => ctx.rest(query("/cron", { profile })),
    getSessions: (limit, offset) => ctx.rest(query("/sessions", { limit, offset })),
    getLogs: (params) => desktop.logs(params)
  };
  return {
    api: api2,
    async fetchJSON(url, init) {
      if (url !== PLUGIN_API_PREFIX && !url.startsWith(`${PLUGIN_API_PREFIX}/`)) {
        throw new Error(`Desktop Home cannot access API path: ${url}`);
      }
      const path = url.slice(PLUGIN_API_PREFIX.length) || "/";
      const options = {};
      if (init?.method) options.method = init.method;
      if (init?.body !== void 0 && init.body !== null) {
        options.body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
      }
      return ctx.rest(path, options);
    },
    navigateTo: (path) => desktop.navigate(desktopRoute(path)),
    onEvent: (type, listener) => desktop.onEvent(type, listener)
  };
}
function DesktopHomePage() {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("style", { children: homeCss }),
    /* @__PURE__ */ jsx(HomePage, {})
  ] });
}
const plugin = {
  id: "home-dashboard",
  name: "Home",
  defaultEnabled: true,
  register(ctx) {
    configureHomeHost(createDesktopHomeHost(ctx, host));
    ctx.registerMany(
      createHomeContributions(
        () => /* @__PURE__ */ jsx(DesktopHomePage, {}),
        (path) => host.navigate(path)
      )
    );
    window.setTimeout(() => {
      openHomeOnDesktopStart(
        window.sessionStorage,
        (path) => host.navigate(path),
        window.location.search
      );
    }, 0);
  }
};
export {
  plugin as default
};
