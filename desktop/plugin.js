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
  getModelsAnalytics: (days) => getHost().api.getModelsAnalytics(days),
  getCronJobs: (profile) => getHost().api.getCronJobs(profile),
  getSessions: (limit, offset) => getHost().api.getSessions(limit, offset),
  getLogs: (params) => getHost().api.getLogs(params)
};
function fetchJSON(url, init) {
  return getHost().fetchJSON(url, init);
}
const PLUGIN_API = "/api/plugins/home-dashboard";
function getAnalyticsSeries(days, group) {
  return fetchJSON(
    `${PLUGIN_API}/analytics/series?days=${days}&group=${group}`
  );
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
  className,
  children
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
    ),
    children
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
const PAD$2 = "⠀";
const INK = "⣿";
const W$1 = 29;
function row(lead, fill) {
  return PAD$2.repeat(lead) + INK.repeat(fill) + PAD$2.repeat(Math.max(0, W$1 - lead - fill));
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
function formatTokenCount(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)}K`;
  return String(n);
}
function groupMode(raw) {
  return raw === "model" || raw === "provider" ? raw : "day";
}
function needsModels(mode) {
  return mode !== "day";
}
const UNLABELED = "未标注";
const PROVIDER_ALIASES = {
  "alibaba-cn": "Alibaba",
  alibaba: "Alibaba",
  "bailian-others": "Alibaba",
  "dashscope-others": "Alibaba"
};
function normalize(raw) {
  return (raw ?? "").trim().toLowerCase();
}
function providerLabel(raw) {
  const key = normalize(raw);
  if (!key) return UNLABELED;
  return PROVIDER_ALIASES[key] ?? (raw ?? "").trim();
}
const MAX_BUCKETS = 6;
function topBuckets(buckets, max) {
  const limit = Math.max(0, Math.trunc(max));
  if (buckets.length <= limit) return { top: buckets, hidden: 0 };
  return { top: buckets.slice(0, limit), hidden: buckets.length - limit };
}
function parseDay$1(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(day);
}
function monthKeyOf(day) {
  const date = parseDay$1(day);
  return isNaN(date.getTime()) ? day.slice(0, 7) : `${date.getFullYear()}-${date.getMonth()}`;
}
function seriesSlots(daySlots, byMonth) {
  if (!byMonth) return daySlots;
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const day of daySlots) {
    const key = monthKeyOf(day);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}
function slotLabel(slot, byMonth) {
  if (byMonth) {
    const m = /^(\d{4})-(\d{1,2})$/.exec(slot);
    return m ? new Date(Number(m[1]), Number(m[2]), 1).toLocaleDateString(void 0, { month: "short" }) : slot;
  }
  const date = parseDay$1(slot);
  return isNaN(date.getTime()) ? slot : date.toLocaleDateString(void 0, { month: "short", day: "numeric" });
}
function foldTokenSeries(rows, mode, daySlots, byMonth = false) {
  const slots = seriesSlots(daySlots, byMonth);
  const axis = new Map(slots.map((slot, i) => [slot, i]));
  const series = /* @__PURE__ */ new Map();
  for (const row2 of rows) {
    const label = mode === "provider" ? providerLabel(row2.provider) : normalize(row2.model) ? String(row2.model).trim() : UNLABELED;
    const key = normalize(label);
    const i = axis.get(byMonth ? monthKeyOf(row2.day) : row2.day);
    if (i === void 0) continue;
    const cur = series.get(key) ?? { key, label, tokens: 0, values: slots.map(() => 0), isOther: false };
    const value = row2.tokens ?? 0;
    cur.tokens += value;
    cur.values[i] += value;
    series.set(key, cur);
  }
  return [...series.values()].sort(
    (a, b) => b.tokens - a.tokens || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)
  );
}
const OTHER_KEY = "__other__";
const OTHER_LABEL = "其他";
function takeTopSeries(series, max = MAX_BUCKETS) {
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
      values: Array.from({ length: width }, (_, i) => rest.reduce((sum, s) => sum + (s.values[i] ?? 0), 0)),
      isOther: true
    }
  ];
}
function stackColumnPct(total, peak) {
  if (!(total > 0)) return 0;
  return Math.min(100, Math.max(8, total / Math.max(1, peak) * 100));
}
function stackSegmentPcts(values, columnPct, total) {
  if (!(total > 0) || columnPct <= 0) return values.map(() => 0);
  return values.map((value) => value > 0 ? value / total * columnPct : 0);
}
function lineCoords(values, peak, W2 = 100, H2 = 100, PAD2 = 3) {
  const n = values.length;
  const max = Math.max(1, peak);
  return values.map((value, i) => [
    n <= 1 ? W2 / 2 : i / (n - 1) * W2,
    H2 - PAD2 - value / max * (H2 - PAD2 * 2)
  ]);
}
function linePathOf(coords) {
  return coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}
const SERIES_COLORS = [
  "#21508C",
  "#2962AE",
  "#3075CF",
  "#528BD6",
  "#73A1DE",
  "#94B7E6",
  "#B5CDED"
];
const OTHER_COLOR = "#7c8494";
const COLOR_STEPS = [0, 2, 4, 6, 1, 3];
function assignColorSteps(count) {
  return COLOR_STEPS.slice(0, Math.max(0, Math.min(Math.trunc(count), COLOR_STEPS.length)));
}
function sessionSort(raw) {
  return raw === "tokens" ? "tokens" : "recent";
}
function sortSessions(list, mode) {
  if (mode !== "tokens") return list;
  const io = (s) => (s.input_tokens ?? 0) + (s.output_tokens ?? 0);
  return [...list].sort((a, b) => io(b) - io(a));
}
const PER_PAGE$1 = 3;
const SORTS = ["recent", "tokens"];
function SessionsWidget({
  status,
  sessions,
  widgetProps,
  onWidgetPropsChange
}) {
  const [page, setPage] = useState(0);
  if (!status && !sessions) return /* @__PURE__ */ jsx("span", { className: "dim", children: "loading…" });
  const sort = sessionSort(widgetProps.sort);
  const setProp = (patch) => onWidgetPropsChange({ ...widgetProps, ...patch });
  const all = sortSessions(sessions?.sessions ?? [], sort);
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE$1));
  const p = Math.min(page, pages - 1);
  const slice = all.slice(p * PER_PAGE$1, p * PER_PAGE$1 + PER_PAGE$1);
  const sortCtl = SORTS.map((s) => /* @__PURE__ */ jsx(
    "button",
    {
      className: `hv-opt${sort === s ? " on" : ""}`,
      onClick: () => setProp({ sort: s }),
      title: s === "recent" ? "backend order (recent)" : "most tokens first",
      children: s
    },
    s
  ));
  return /* @__PURE__ */ jsxs("div", { children: [
    pages > 1 ? /* @__PURE__ */ jsxs(
      HoverArrows,
      {
        onPrev: () => setPage(Math.max(0, p - 1)),
        onNext: () => setPage(Math.min(pages - 1, p + 1)),
        label: `${p + 1}/${pages}`,
        prevDisabled: p <= 0,
        nextDisabled: p >= pages - 1,
        children: [
          /* @__PURE__ */ jsx("span", { className: "tok-div" }),
          sortCtl
        ]
      }
    ) : /* @__PURE__ */ jsx(HoverCtl, { className: "hover-arrows", children: sortCtl }),
    /* @__PURE__ */ jsx("span", { className: "bigval", children: status?.active_sessions ?? "—" }),
    /* @__PURE__ */ jsx("span", { className: "dim", children: " active" }),
    /* @__PURE__ */ jsx("div", { className: "rows", children: slice.map((s) => /* @__PURE__ */ jsxs("div", { className: "row", children: [
      /* @__PURE__ */ jsx("span", { className: "dim row-name", title: s.title ?? s.source ?? s.id, children: s.title ?? s.source ?? s.id }),
      /* @__PURE__ */ jsx("span", { className: "dim num", children: formatTokenCount(s.input_tokens + s.output_tokens) }),
      /* @__PURE__ */ jsx("span", { className: s.is_active ? "ok" : "dim", children: s.is_active ? "live" : "idle" })
    ] }, s.id)) })
  ] });
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
const SERIES_CACHE_MS = 6e4;
const GROUPS = ["day", "model", "provider"];
const H = 100, W = 100, PAD$1 = 3;
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
  const group = groupMode(widgetProps.group);
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
  const cacheRef = useRef(/* @__PURE__ */ new Map());
  const [series, setSeries] = useState(null);
  const [hoverKey, setHoverKey] = useState(null);
  const [gtip, setGTip] = useState(null);
  useEffect(() => {
    if (!needsModels(group)) return;
    const mode = group === "provider" ? "provider" : "model";
    let cancelled = false;
    const cached = cacheRef.current.get(range.days);
    if (cached && Date.now() - cached.at < SERIES_CACHE_MS) {
      setSeries({ days: range.days, data: cached.data, stale: false, failed: false });
      return;
    }
    getAnalyticsSeries(range.days, mode).then((r) => {
      if (cancelled) return;
      cacheRef.current.set(range.days, { data: r, at: Date.now() });
      setSeries({ days: range.days, data: r, stale: false, failed: false });
    }).catch(() => {
      if (cancelled) return;
      setSeries((prev) => {
        const data = (prev && prev.days === range.days ? prev.data : null) ?? cacheRef.current.get(range.days)?.data ?? null;
        return { days: range.days, data, stale: data !== null, failed: true };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [group, range.days]);
  const setProp = (patch) => onWidgetPropsChange({ ...widgetProps, ...patch });
  const cycle = (dir) => setProp({ range: RANGES[(idx + dir + RANGES.length) % RANGES.length].key });
  const controls = /* @__PURE__ */ jsx(HoverCtl, { className: "tok-ctl tok-set", children: /* @__PURE__ */ jsxs("div", { className: "tok-line", children: [
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
    ),
    /* @__PURE__ */ jsx("span", { className: "tok-div" }),
    GROUPS.map((g) => /* @__PURE__ */ jsx(
      "button",
      {
        className: `hv-opt${group === g ? " on" : ""}`,
        onClick: () => setProp({ group: g }),
        title: g === "day" ? "per-day chart" : `group this range by ${g}`,
        children: g
      },
      g
    ))
  ] }) });
  const view = fetched ?? (failed ? analytics : null);
  const bars = useMemo(
    () => toBars(view?.daily ?? [], range.byMonth),
    [view, range.byMonth]
  );
  const grouped = group === "day" ? null : group;
  if (grouped) {
    const sv = series && series.days === range.days ? series : null;
    const data = sv?.data ?? null;
    if (!data) {
      return /* @__PURE__ */ jsxs("div", { children: [
        controls,
        /* @__PURE__ */ jsx("span", { className: "dim", children: sv?.failed ? "unavailable" : "loading…" })
      ] });
    }
    const points = takeTopSeries(
      foldTokenSeries(data.rows, grouped, data.days, range.byMonth),
      MAX_BUCKETS
    );
    if (!points.length) {
      return /* @__PURE__ */ jsxs("div", { children: [
        controls,
        /* @__PURE__ */ jsx("span", { className: "dim", children: "no usage in this range" })
      ] });
    }
    const slots = seriesSlots(data.days, range.byMonth);
    const steps = assignColorSteps(points.length);
    const colors = points.map((p, i) => p.isOther ? OTHER_COLOR : SERIES_COLORS[steps[i]]);
    const columnTotals = slots.map((_, i) => points.reduce((sum, p) => sum + (p.values[i] ?? 0), 0));
    const peak = Math.max(1, ...columnTotals);
    const dimmed = (key) => hoverKey && hoverKey !== key ? 0.22 : 1;
    const hover = (slot, i, tokens) => {
      setGTip({ label: slotLabel(slot, range.byMonth), tokens, frac: (i + 0.5) / slots.length });
      setShow(true);
    };
    const leave = () => {
      setGTip(null);
      setShow(false);
    };
    const t2 = view?.totals ?? null;
    return /* @__PURE__ */ jsxs("div", { children: [
      controls,
      t2 ? /* @__PURE__ */ jsx("span", { className: "bigval", children: formatTokenCount(t2.total_input + t2.total_output) }) : /* @__PURE__ */ jsx("span", { className: "dim", children: "loading…" }),
      /* @__PURE__ */ jsxs("span", { className: "dim", children: [
        " by ",
        group,
        " · ",
        range.label,
        sv?.stale ? " · stale" : ""
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "home-spark-wrap", onMouseLeave: leave, children: [
        gtip && /* @__PURE__ */ jsxs(
          "div",
          {
            className: `home-spark-tip${show ? " show" : ""}`,
            style: { left: `${gtip.frac * 100}%`, transform: `translateX(${-gtip.frac * 100}%)` },
            children: [
              /* @__PURE__ */ jsx("b", { children: gtip.label }),
              " · ",
              formatTokenCount(gtip.tokens)
            ]
          }
        ),
        chart === "line" ? /* @__PURE__ */ jsxs("svg", { className: "home-area", viewBox: "0 0 100 100", preserveAspectRatio: "none", children: [
          points.map((p, i) => /* @__PURE__ */ jsx(
            "path",
            {
              d: linePathOf(lineCoords(p.values, peak, W, H, PAD$1)),
              fill: "none",
              stroke: colors[i],
              strokeWidth: 1.5,
              strokeLinejoin: "round",
              strokeLinecap: "round",
              strokeDasharray: p.isOther ? "4 3" : void 0,
              opacity: dimmed(p.key),
              vectorEffect: "non-scaling-stroke"
            },
            p.key
          )),
          slots.map((slot, i) => /* @__PURE__ */ jsx(
            "rect",
            {
              x: i * W / slots.length,
              y: 0,
              width: W / slots.length,
              height: H,
              fill: "transparent",
              onMouseEnter: () => hover(slot, i, columnTotals[i]),
              onMouseLeave: leave
            },
            slot
          ))
        ] }) : /* @__PURE__ */ jsx("div", { className: "tok-stack", children: slots.map((slot, i) => {
          const total2 = columnTotals[i];
          const columnPct = stackColumnPct(total2, peak);
          const segs = stackSegmentPcts(
            points.map((p) => p.values[i] ?? 0),
            columnPct,
            total2
          );
          return /* @__PURE__ */ jsx(
            "div",
            {
              className: "tok-col",
              onMouseEnter: () => hover(slot, i, total2),
              onMouseLeave: leave,
              children: points.map(
                (p, si) => segs[si] > 0 ? /* @__PURE__ */ jsx(
                  "i",
                  {
                    className: "tok-seg",
                    style: { height: `${segs[si]}%`, background: colors[si], opacity: dimmed(p.key) }
                  },
                  p.key
                ) : null
              )
            },
            slot
          );
        }) })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "tok-legend", onMouseLeave: () => setHoverKey(null), children: points.map((p, i) => /* @__PURE__ */ jsxs(
        "span",
        {
          className: `tok-legend-item${hoverKey && hoverKey !== p.key ? " dim" : ""}`,
          title: p.label,
          onMouseEnter: () => setHoverKey(p.key),
          children: [
            /* @__PURE__ */ jsx("i", { className: "tok-swatch", style: { background: colors[i] } }),
            /* @__PURE__ */ jsx("span", { className: "tok-legend-name", children: p.label })
          ]
        },
        p.key
      )) }),
      statsOn && t2 && /* @__PURE__ */ jsxs("div", { className: "tok-stats", children: [
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("span", { className: "dim", children: "in" }),
          " ",
          formatTokenCount(t2.total_input)
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("span", { className: "dim", children: "out" }),
          " ",
          formatTokenCount(t2.total_output)
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          /* @__PURE__ */ jsx("span", { className: "dim", children: "cost" }),
          " ",
          /* @__PURE__ */ jsxs("span", { className: "ok", children: [
            "$",
            t2.total_estimated_cost.toFixed(2)
          ] })
        ] })
      ] })
    ] });
  }
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
  const coords = bars.map((b, i) => [
    n <= 1 ? W / 2 : i / (n - 1) * W,
    H - PAD$1 - b.tokens / max * (H - PAD$1 * 2)
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
            x: i * W / n,
            y: 0,
            width: W / n,
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
function areaPath(line, H2) {
  if (!line || !line.includes("L") || line.indexOf("M", 1) !== -1) return "";
  const firstX = line.slice(1, line.indexOf(","));
  const lastX = line.slice(line.lastIndexOf("L") + 1, line.lastIndexOf(","));
  return `${line} L${lastX},${H2} L${firstX},${H2} Z`;
}
function seriesPath(values, max, W2, H2, pad2) {
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
    const y = H2 - pad2 - Math.min(v, max) / max * (H2 - pad2 * 2);
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
  const H2 = 100, W2 = 100, PAD2 = 6;
  const line = seriesPath(values, max, W2, H2, PAD2);
  const area = areaPath(line, H2);
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
    component: ({ data, widgetProps, onWidgetPropsChange }) => /* @__PURE__ */ jsx(
      SessionsWidget,
      {
        status: data.status,
        sessions: data.sessions,
        widgetProps,
        onWidgetPropsChange
      }
    ),
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
  sessions: () => api.getSessions(20),
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
const homeCss = "/* Home page — rice-style widget grid.\r\n * Every color routes through --home-accent (the active theme's primary),\r\n * so switching themes recolors the whole page with zero widget changes.\r\n * Swap teal (#2dd4bf) stays fixed: it is interaction semantics, not theme. */\r\n\r\n.home-root {\r\n  --home-accent: var(--color-primary, var(--ui-accent, #ffd700));\r\n  --home-accent-dim: color-mix(in srgb, var(--home-accent) 55%, #000);\r\n  /* Readable secondary text (headers, captions): dim was ~3:1 on the glass. */\r\n  --home-accent-soft: color-mix(in srgb, var(--home-accent) 82%, #9aa3b5);\r\n  --home-surface: color-mix(\r\n    in srgb,\r\n    var(--home-accent) 6%,\r\n    var(--ui-editor-surface-background, rgb(10 10 14 / 0.55))\r\n  );\r\n  --home-border: color-mix(in srgb, var(--home-accent) 18%, transparent);\r\n  --home-error: var(--color-destructive, #e25555);\r\n  position: relative;\r\n  height: 100%;\r\n  overflow: auto;\r\n  font-family: var(--theme-font-mono, ui-monospace, monospace);\r\n  color: var(--color-foreground, var(--ui-text-primary, #d8dce6));\r\n}\r\n\r\n.home-stage {\r\n  position: relative;\r\n  min-height: 60vh;\r\n  touch-action: none;\r\n}\r\n\r\n.home-widget {\r\n  position: absolute;\r\n  border-radius: 8px;\r\n  padding: 10px 12px;\r\n  background: var(--home-surface);\r\n  border: 1px solid var(--home-border);\r\n  backdrop-filter: blur(12px);\r\n  -webkit-backdrop-filter: blur(12px);\r\n  box-shadow: 0 10px 30px rgb(0 0 0 / 0.5);\r\n  overflow: hidden;\r\n  transition: left 0.18s ease, top 0.18s ease;\r\n  container-type: size;\r\n  font-size: 11px;\r\n  line-height: 1.5;\r\n  /* Promote each widget to its own compositor layer so the constantly\r\n   * repainting matrix canvas doesn't force the neighbours' backdrop-filter\r\n   * to recompose every frame — that recomposition is what produced the\r\n   * horizontal flicker sweeping across the glass panels. */\r\n  transform: translateZ(0);\r\n  contain: paint;\r\n}\r\n.home-root.editing .home-widget { user-select: none; }\r\n.home-widget.dragging {\r\n  transition: none;\r\n  opacity: 0.9;\r\n  border-color: var(--home-accent);\r\n  z-index: 50;\r\n  cursor: grabbing;\r\n}\r\n.home-widget.swap-target {\r\n  border-color: #2dd4bf;\r\n  box-shadow: 0 0 0 1px rgb(45 212 191 / 0.5), 0 10px 30px rgb(0 0 0 / 0.5);\r\n}\r\n/* Over the trash zone — about to be deleted. */\r\n.home-widget.trashing {\r\n  opacity: 0.45;\r\n  border-color: var(--home-error);\r\n  box-shadow: 0 0 0 1px color-mix(in srgb, var(--home-error) 60%, transparent),\r\n    0 10px 30px rgb(0 0 0 / 0.5);\r\n}\r\n\r\n/* Floating label that follows the pointer while dragging a new widget in. */\r\n.home-add-ghost {\r\n  position: fixed;\r\n  z-index: 70;\r\n  transform: translate(-50%, -140%);\r\n  padding: 4px 10px;\r\n  border-radius: 6px;\r\n  font-size: 11px;\r\n  white-space: nowrap;\r\n  pointer-events: none;\r\n  color: var(--home-accent);\r\n  background: var(--home-surface);\r\n  border: 1px solid var(--home-accent);\r\n  backdrop-filter: blur(12px);\r\n  -webkit-backdrop-filter: blur(12px);\r\n  box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);\r\n}\r\n\r\n.home-widget .hd {\r\n  display: block;\r\n  font-size: 9.5px;\r\n  letter-spacing: 0.18em;\r\n  margin-bottom: 6px;\r\n  font-weight: 700;\r\n  text-transform: uppercase;\r\n  color: var(--home-accent-soft);\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n}\r\n.home-widget .hd::before { content: \"── \"; opacity: 0.5; }\r\n.home-widget .hd::after { content: \" ─────────────────────────────────\"; opacity: 0.3; }\r\n.home-root.editing .home-widget .hd { cursor: grab; }\r\n\r\n.home-widget .rs {\r\n  position: absolute;\r\n  right: 2px;\r\n  bottom: 2px;\r\n  width: 13px;\r\n  height: 13px;\r\n  cursor: nwse-resize;\r\n  border-right: 2px solid color-mix(in srgb, var(--home-accent) 45%, transparent);\r\n  border-bottom: 2px solid color-mix(in srgb, var(--home-accent) 45%, transparent);\r\n  border-radius: 2px;\r\n  z-index: 3;\r\n}\r\n.home-widget .wremove {\r\n  position: absolute;\r\n  top: 4px;\r\n  right: 6px;\r\n  z-index: 3;\r\n  background: none;\r\n  border: none;\r\n  color: var(--home-error);\r\n  font-size: 13px;\r\n  line-height: 1;\r\n  cursor: pointer;\r\n  padding: 2px 4px;\r\n}\r\n.home-widget .werr { color: var(--home-error); }\r\n/* Data-source states (widget-state.ts): honest copy per failure kind. */\r\n.home-widget .wstate { display: block; font-size: 10px; letter-spacing: 0.04em; }\r\n.home-widget .wstate::before { content: \"● \"; }\r\n.home-widget .wstate-offline { color: var(--home-error); }\r\n.home-widget .wstate-unavailable { color: #f5b945; }\r\n.home-widget .hd .hd-stale { color: #f5b945; letter-spacing: 0.1em; opacity: 0.8; }\r\n\r\n/* ── hover controls (contextual chrome, rest mode only) ──\r\n * Reusable floating control rendered inside a widget body. Hidden by default,\r\n * fades in while hovering the widget, and fully suppressed in edit mode so it\r\n * never fights drag/resize. Widgets opt in by rendering <HoverCtl>/<HoverArrows>. */\r\n.hover-ctl {\r\n  position: absolute;\r\n  top: 4px;\r\n  right: 6px;\r\n  z-index: 4;\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 4px;\r\n  opacity: 0;\r\n  pointer-events: none;\r\n  transition: opacity 0.18s ease;\r\n  /* Sits on the glass without a hard edge. */\r\n  padding: 1px 3px;\r\n  border-radius: 6px;\r\n  background: color-mix(in srgb, var(--home-surface) 80%, transparent);\r\n}\r\n.home-widget:hover .hover-ctl,\r\n.hover-ctl:focus-within { opacity: 1; pointer-events: auto; }\r\n.home-root.editing .hover-ctl { display: none; }\r\n@media (hover: none) {\r\n  /* Touch: no hover, so keep controls reachable but understated. */\r\n  .hover-ctl { opacity: 0.5; pointer-events: auto; }\r\n}\r\n\r\n.hv-arrow {\r\n  background: none;\r\n  border: none;\r\n  cursor: pointer;\r\n  padding: 0 3px;\r\n  color: var(--home-accent-dim);\r\n  font-size: 14px;\r\n  line-height: 1;\r\n  font-family: inherit;\r\n}\r\n.hv-arrow:hover:not(:disabled) { color: var(--home-accent); }\r\n.hv-arrow:disabled { opacity: 0.3; cursor: default; }\r\n.hv-label {\r\n  font-size: 9px;\r\n  letter-spacing: 0.1em;\r\n  text-transform: uppercase;\r\n  color: var(--home-accent-dim);\r\n  white-space: nowrap;\r\n}\r\n.hv-label-btn {\r\n  background: none;\r\n  border: none;\r\n  cursor: pointer;\r\n  font: inherit;\r\n  letter-spacing: 0.1em;\r\n  padding: 0;\r\n}\r\n.hv-label-btn:hover { color: var(--home-accent); }\r\n\r\n/* Toggle/option buttons inside a hover control (clock format, host view…). */\r\n.hv-opt {\r\n  background: none;\r\n  border: none;\r\n  cursor: pointer;\r\n  font: inherit;\r\n  font-size: 9px;\r\n  letter-spacing: 0.08em;\r\n  text-transform: uppercase;\r\n  color: var(--home-accent-dim);\r\n  padding: 0 4px;\r\n  border-radius: 4px;\r\n}\r\n.hv-opt:hover { color: var(--home-accent); }\r\n.hv-opt.on { color: #000; background: var(--home-accent); }\r\n\r\n/* Extra detail that smoothly expands on widget hover (rest mode only). Uses\r\n * the 0fr→1fr grid trick so it animates real height without a fixed value. */\r\n.hover-reveal {\r\n  display: grid;\r\n  grid-template-rows: 0fr;\r\n  opacity: 0;\r\n  transition: grid-template-rows 0.25s ease, opacity 0.2s ease, margin-top 0.25s ease;\r\n}\r\n.home-widget:hover .hover-reveal { grid-template-rows: 1fr; opacity: 1; margin-top: 4px; }\r\n.home-root.editing .hover-reveal { grid-template-rows: 0fr; opacity: 0; margin-top: 0; }\r\n.hover-reveal > * { overflow: hidden; min-height: 0; }\r\n\r\n.home-ghost {\r\n  position: absolute;\r\n  border: 1.5px dashed color-mix(in srgb, var(--home-accent) 70%, transparent);\r\n  border-radius: 8px;\r\n  background: color-mix(in srgb, var(--home-accent) 7%, transparent);\r\n  display: none;\r\n  z-index: 5;\r\n  pointer-events: none;\r\n  transition: left 0.18s ease, top 0.18s ease, width 0.18s ease, height 0.18s ease;\r\n}\r\n.home-ghost.visible { display: block; }\r\n.home-ghost.swap {\r\n  border-color: rgb(45 212 191 / 0.85);\r\n  background: rgb(45 212 191 / 0.08);\r\n}\r\n\r\n/* ── widget content primitives (responsive to the widget's own size) ── */\r\n.home-widget .rows { column-gap: 18px; }\r\n@container (min-width: 380px) {\r\n  .home-widget .rows { columns: 2; column-rule: 1px solid rgb(255 255 255 / 0.06); }\r\n}\r\n@container (min-width: 600px) {\r\n  .home-widget .rows { columns: 3; }\r\n}\r\n.home-widget .row {\r\n  display: flex;\r\n  justify-content: space-between;\r\n  gap: 6px;\r\n  padding: 1px 0;\r\n  border-bottom: 1px solid rgb(255 255 255 / 0.04);\r\n  break-inside: avoid;\r\n}\r\n.home-widget .row:last-child { border-bottom: none; }\r\n/* Names flex and ellipsize at the real column width instead of a fixed\r\n * character slice that cut words mid-glyph (\"bitacoras-guayab\"). */\r\n.home-widget .row > * { flex: none; }\r\n.home-widget .row > .row-name {\r\n  flex: 1 1 auto;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  white-space: nowrap;\r\n  text-overflow: ellipsis;\r\n}\r\n/* Numeric column (token counts) keeps equal-width digits. */\r\n.home-widget .row .num { font-variant-numeric: tabular-nums; }\r\n\r\n.home-widget .meters { column-gap: 18px; }\r\n@container (min-width: 380px) {\r\n  .home-widget .meters { columns: 2; }\r\n}\r\n.home-widget .meter {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  margin: 3px 0;\r\n  break-inside: avoid;\r\n}\r\n.home-widget .meter .lbl { width: 34px; color: var(--color-muted-foreground, #7d8496); font-size: 10px; }\r\n.home-widget .meter .track {\r\n  flex: 1;\r\n  height: 7px;\r\n  border-radius: 2px;\r\n  background: rgb(255 255 255 / 0.07);\r\n  overflow: hidden;\r\n}\r\n.home-widget .meter .fill {\r\n  height: 100%;\r\n  background: linear-gradient(90deg, var(--home-accent-dim), var(--home-accent));\r\n  transition: width 0.6s ease;\r\n}\r\n.home-widget .meter .val { width: 44px; text-align: right; font-size: 10px; }\r\n\r\n.home-widget .ok { color: var(--home-accent); }\r\n.home-widget .dim { color: var(--color-muted-foreground, #6b7387); }\r\n.home-widget .bigval {\r\n  font-size: min(9cqw, 18cqh);\r\n  font-weight: 700;\r\n  color: var(--home-accent);\r\n}\r\n\r\n.home-clock-wrap {\r\n  display: flex;\r\n  flex-direction: column;\r\n  align-items: center;\r\n  justify-content: center;\r\n  height: calc(100% - 18px);\r\n}\r\n.home-clock {\r\n  font-size: min(26cqw, 52cqh);\r\n  font-weight: 800;\r\n  color: var(--home-accent);\r\n  letter-spacing: 0.02em;\r\n  text-shadow: 0 0 24px color-mix(in srgb, var(--home-accent) 35%, transparent);\r\n  line-height: 1;\r\n}\r\n.home-clock-ampm {\r\n  font-size: 0.32em;\r\n  vertical-align: 0.9em;\r\n  margin-left: 0.2em;\r\n  letter-spacing: 0.05em;\r\n  color: var(--home-accent-dim);\r\n}\r\n.home-clock-sub {\r\n  color: var(--home-accent-dim);\r\n  font-size: max(9px, min(3.4cqw, 8cqh));\r\n  letter-spacing: 0.14em;\r\n  text-transform: uppercase;\r\n  margin-top: 1cqh;\r\n}\r\n\r\n.home-ascii-wrap {\r\n  display: flex;\r\n  flex-direction: column;\r\n  align-items: center;\r\n  justify-content: center;\r\n  height: calc(100% - 18px);\r\n}\r\n.home-ascii {\r\n  font-size: min(5.6cqw, 5.4cqh);\r\n  line-height: 1.05;\r\n  white-space: pre;\r\n  text-align: center;\r\n  background: linear-gradient(\r\n    180deg,\r\n    var(--home-accent-dim),\r\n    var(--home-accent) 40%,\r\n    var(--home-accent) 60%,\r\n    var(--home-accent-dim)\r\n  );\r\n  -webkit-background-clip: text;\r\n  background-clip: text;\r\n  color: transparent;\r\n  filter: drop-shadow(0 0 10px color-mix(in srgb, var(--home-accent) 25%, transparent));\r\n}\r\n.home-ascii-caduceus {\r\n  transform: scaleX(0.88);\r\n  transform-origin: center;\r\n}\r\n.home-ascii-ver {\r\n  text-align: center;\r\n  color: var(--home-accent-soft);\r\n  font-size: max(8px, min(2.6cqw, 5cqh));\r\n  letter-spacing: 0.22em;\r\n  margin-top: 1.5cqh;\r\n}\r\n\r\n.home-spark {\r\n  display: flex;\r\n  align-items: flex-end;\r\n  gap: 2px;\r\n  height: max(18px, 22cqh);\r\n  margin: 6px 0 4px;\r\n}\r\n.home-spark i {\r\n  flex: 1;\r\n  background: linear-gradient(180deg, var(--home-accent), var(--home-accent-dim));\r\n  border-radius: 1px 1px 0 0;\r\n  opacity: 0.85;\r\n  transition: height 0.6s ease, opacity 0.15s ease;\r\n  cursor: default;\r\n}\r\n.home-spark i:hover { opacity: 1; }\r\n\r\n/* Hover tooltip over a bar (tokens widget). Anchored to the bar via inline\r\n * `left` + `translateX`, which clamps it inside the clipped widget; the appear/\r\n * disappear slide+fade runs on the independent `translate` property so it never\r\n * fights the positioning transform. */\r\n.home-spark-wrap { position: relative; }\r\n.home-spark-tip {\r\n  position: absolute;\r\n  bottom: 100%;\r\n  margin-bottom: 6px;\r\n  padding: 3px 7px;\r\n  border-radius: 6px;\r\n  background: color-mix(in srgb, var(--home-accent) 10%, rgb(8 8 12 / 0.96));\r\n  border: 1px solid var(--home-border);\r\n  color: rgb(236 236 242);\r\n  font-size: 10px;\r\n  line-height: 1.3;\r\n  white-space: nowrap;\r\n  pointer-events: none;\r\n  opacity: 0;\r\n  translate: 0 4px;\r\n  transition: opacity 0.18s ease, translate 0.18s ease, transform 0.18s ease;\r\n  z-index: 6;\r\n}\r\n.home-spark-tip.show { opacity: 1; translate: 0 0; }\r\n.home-spark-tip b { color: var(--home-accent); font-weight: 600; }\r\n\r\n/* Line/area chart (tokens widget, alternative to the bars). Stretched to fill\r\n * via preserveAspectRatio=none; the stroke stays crisp with non-scaling-stroke. */\r\n.home-area {\r\n  display: block;\r\n  width: 100%;\r\n  height: max(18px, 22cqh);\r\n  margin: 6px 0 4px;\r\n  overflow: visible;\r\n}\r\n.home-area rect { cursor: default; }\r\n\r\n/* Host graphs view: four live sparklines (cpu / ram / load / proc) in a 2×2\r\n * grid over a rolling one-minute window. Fills the widget below the header\r\n * (same absolute pattern as the canvas widgets); cells reuse .home-area but\r\n * stretch to their cell height instead of the tokens widget's fixed band. */\r\n.host-sparks {\r\n  position: absolute;\r\n  inset: 30px 12px 10px;\r\n  display: grid;\r\n  grid-template-columns: 1fr 1fr;\r\n  grid-template-rows: 1fr 1fr;\r\n  gap: 4px 12px;\r\n  min-height: 0;\r\n}\r\n.host-spark {\r\n  display: flex;\r\n  flex-direction: column;\r\n  min-height: 0;\r\n  min-width: 0;\r\n}\r\n.host-spark-head {\r\n  display: flex;\r\n  justify-content: space-between;\r\n  align-items: baseline;\r\n  font-size: max(8px, min(3.2cqw, 6cqh));\r\n  letter-spacing: 0.14em;\r\n  text-transform: uppercase;\r\n}\r\n.host-spark-head .val {\r\n  font-variant-numeric: tabular-nums;\r\n  color: var(--home-accent);\r\n}\r\n.host-spark .home-area {\r\n  flex: 1;\r\n  height: auto;\r\n  min-height: 12px;\r\n  margin: 2px 0 0;\r\n}\r\n\r\n/* Small vertical divider between the range arrows and the toggles. */\r\n.tok-div {\r\n  width: 1px;\r\n  align-self: stretch;\r\n  margin: 2px 2px;\r\n  background: var(--home-border);\r\n}\r\n\r\n/* Totals line, regrouped: each label sticks to its value, groups spaced evenly\r\n * (the old `.row` space-between scattered the six tokens across the full width). */\r\n.tok-stats {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 2px 14px;\r\n  padding: 3px 0 1px;\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n.tok-stats > span { white-space: nowrap; }\r\n.tok-stats .dim { margin-right: 2px; }\r\n\r\n/* Grouped Tokens charts (model / provider). Day view keeps .home-spark and\r\n * .home-area untouched. */\r\n.tok-stack {\r\n  display: flex;\r\n  align-items: flex-end;\r\n  gap: 2px;\r\n  height: max(18px, 22cqh);\r\n  margin: 6px 0 4px;\r\n}\r\n/* One column per axis slot. `column-reverse` stacks the ranked series from the\r\n * baseline up (first series at the bottom), and each segment's height is a % of\r\n * the full band, so the segments of a column sum to its own height. */\r\n.tok-col {\r\n  flex: 1;\r\n  height: 100%;\r\n  min-width: 0;\r\n  display: flex;\r\n  flex-direction: column-reverse;\r\n  cursor: default;\r\n}\r\n.tok-seg {\r\n  display: block;\r\n  width: 100%;\r\n  box-sizing: border-box;\r\n  /* Hairline between two stacked segments: two flat ramp steps touching edge\r\n   * to edge read as one muddy block. Drawn in the widget's own surface dark,\r\n   * never as a third colour. The baseline segment has nothing below it. */\r\n  border-bottom: 1px solid rgb(6 8 14 / 0.75);\r\n  border-radius: 0;\r\n  transition: height 0.6s ease, opacity 0.15s ease;\r\n}\r\n.tok-col .tok-seg:first-child { border-bottom: none; }\r\n.tok-col .tok-seg:last-child { border-radius: 1px 1px 0 0; }\r\n\r\n/* Legend: swatch + name per series. The name truncates (models can be long)\r\n * but the element's title always carries the full one; hovering an entry\r\n * highlights its series in the chart and fades the others. */\r\n.tok-legend {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 1px 10px;\r\n  margin: 2px 0 0;\r\n  font-size: 9px;\r\n  line-height: 1.4;\r\n  color: var(--color-foreground, var(--ui-text-primary, #d8dce6));\r\n}\r\n.tok-legend-item {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 3px;\r\n  max-width: 100%;\r\n  cursor: default;\r\n  transition: opacity 0.15s ease;\r\n}\r\n.tok-legend-item.dim { opacity: 0.35; }\r\n.tok-legend-name {\r\n  max-width: 104px;\r\n  overflow: hidden;\r\n  white-space: nowrap;\r\n  text-overflow: ellipsis;\r\n}\r\n.tok-swatch {\r\n  flex: none;\r\n  width: 7px;\r\n  height: 7px;\r\n  border-radius: 2px;\r\n}\r\n\r\n/* ── logs widget (per-file record list) ── */\r\n.logs-sub {\r\n  display: flex;\r\n  justify-content: space-between;\r\n  align-items: baseline;\r\n  gap: 8px;\r\n}\r\n.logs-file {\r\n  font-size: 11px;\r\n  font-weight: 600;\r\n  letter-spacing: 0.06em;\r\n  color: var(--home-accent);\r\n}\r\n/* The wrapper owns the widget's remaining height so the list scrolls inside it\r\n * instead of growing past the bottom edge (the old calc() resolved against an\r\n * auto-height parent and never clamped). */\r\n.home-logs-wrap {\r\n  display: flex;\r\n  flex-direction: column;\r\n  height: calc(100% - 21px);\r\n  min-height: 0;\r\n}\r\n.home-logs {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 1px;\r\n  flex: 1 1 0;\r\n  min-height: 0;\r\n  overflow-y: auto;\r\n  margin-top: 3px;\r\n  /* Rows that don't fit fade out instead of being sliced by the edge. */\r\n  mask-image: linear-gradient(180deg, #000 calc(100% - 14px), transparent);\r\n}\r\n.log-row {\r\n  display: flex;\r\n  gap: 6px;\r\n  align-items: baseline;\r\n  padding: 1px 0;\r\n  border-bottom: 1px solid rgb(255 255 255 / 0.04);\r\n  cursor: default;\r\n}\r\n.log-row:last-child { border-bottom: none; }\r\n.log-lvl {\r\n  flex: none;\r\n  width: 32px;\r\n  font-size: 9px;\r\n  font-weight: 600;\r\n  letter-spacing: 0.03em;\r\n}\r\n.log-lvl.lvl-error { color: var(--home-error); }\r\n.log-lvl.lvl-warn { color: #f5b945; }\r\n.log-lvl.lvl-info { color: var(--color-muted-foreground, #6b7387); }\r\n.log-time {\r\n  flex: none;\r\n  font-size: 9px;\r\n  color: var(--color-muted-foreground, #6b7387);\r\n  font-variant-numeric: tabular-nums;\r\n}\r\n.log-msg {\r\n  flex: 1;\r\n  min-width: 0;\r\n  font-size: 10px;\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n\r\n.home-matrix-c {\r\n  position: absolute;\r\n  inset: 0;\r\n  top: 24px;\r\n  width: 100%;\r\n  height: calc(100% - 24px);\r\n}\r\n\r\n/* ── notes widget ── */\r\n.home-notes { display: flex; flex-direction: column; gap: 1px; height: calc(100% - 18px); overflow-y: auto; }\r\n.home-notes .note-row {\r\n  display: flex;\r\n  align-items: baseline;\r\n  gap: 7px;\r\n  padding: 1px 0;\r\n  border-bottom: 1px solid rgb(255 255 255 / 0.04);\r\n}\r\n.home-notes .note-mark {\r\n  cursor: pointer;\r\n  width: 12px;\r\n  text-align: center;\r\n  color: var(--home-accent);\r\n  flex-shrink: 0;\r\n}\r\n.home-notes .note-mark.done { color: var(--color-muted-foreground, #6b7387); }\r\n.home-notes .note-text { cursor: text; flex: 1; min-width: 0; overflow-wrap: anywhere; }\r\n.home-notes .note-text.done {\r\n  text-decoration: line-through;\r\n  color: var(--color-muted-foreground, #6b7387);\r\n}\r\n.home-notes .note-input {\r\n  flex: 1;\r\n  min-width: 0;\r\n  background: none;\r\n  border: none;\r\n  border-bottom: 1px dashed var(--home-border);\r\n  outline: none;\r\n  color: inherit;\r\n  font: inherit;\r\n  padding: 0;\r\n}\r\n.home-notes .note-add {\r\n  align-self: flex-start;\r\n  margin-top: 4px;\r\n  background: none;\r\n  border: none;\r\n  cursor: pointer;\r\n  color: var(--home-accent-dim);\r\n  font-size: 14px;\r\n  line-height: 1;\r\n  padding: 2px 6px 2px 2px;\r\n}\r\n.home-notes .note-add:hover { color: var(--home-accent); }\r\n\r\n/* ── canvas widgets (heartbeat, life) ── */\r\n.home-canvas {\r\n  position: absolute;\r\n  inset: 0;\r\n  top: 24px;\r\n  width: 100%;\r\n  height: calc(100% - 24px);\r\n}\r\n/* Life is drawable in rest mode — signal it with a crosshair. */\r\n.home-root:not(.editing) .home-life { cursor: crosshair; }\r\n\r\n/* ── moon ── */\r\n.home-moon-wrap {\r\n  display: flex;\r\n  flex-direction: column;\r\n  align-items: center;\r\n  height: calc(100% - 18px);\r\n}\r\n.home-moon-c { flex: 1; width: 100%; min-height: 0; }\r\n.home-moon-label {\r\n  color: var(--home-accent-dim);\r\n  font-size: max(8px, min(3cqw, 6cqh));\r\n  letter-spacing: 0.14em;\r\n  text-transform: uppercase;\r\n}\r\n\r\n/* ── pomodoro / countdown ── */\r\n.home-pomo .home-clock,\r\n.home-count .home-clock { cursor: pointer; }\r\n.home-pomo .home-clock.paused { opacity: 0.55; }\r\n.home-pomo .pomo-sub { cursor: pointer; }\r\n.home-count .count-label { cursor: pointer; }\r\n.home-count .count-input,\r\n.home-pomo .count-input { max-width: 92%; text-align: center; color-scheme: dark; }\r\n\r\n/* ── countdown segment editor (alarm-style spinners) ── */\r\n.count-edit {\r\n  display: flex;\r\n  flex-direction: column;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 3px;\r\n  height: calc(100% - 18px);\r\n}\r\n.count-edit-row { display: flex; align-items: center; gap: 5px; }\r\n.count-seg { display: flex; flex-direction: column; align-items: center; }\r\n.count-seg .seg-btn {\r\n  background: none;\r\n  border: none;\r\n  cursor: pointer;\r\n  padding: 0;\r\n  line-height: 0.6;\r\n  font-size: 8px;\r\n  color: var(--home-accent-dim);\r\n}\r\n.count-seg .seg-btn:hover { color: var(--home-accent); }\r\n.count-seg .seg-val {\r\n  background: none;\r\n  border: none;\r\n  outline: none;\r\n  text-align: center;\r\n  color: var(--home-accent);\r\n  font: inherit;\r\n  font-weight: 800;\r\n  font-size: max(12px, min(7cqw, 15cqh));\r\n  padding: 1px 0;\r\n  border-bottom: 1px solid transparent;\r\n  letter-spacing: 0.02em;\r\n}\r\n.count-seg input.seg-val:focus { border-bottom-color: var(--home-accent); }\r\n.count-seg .seg-static { cursor: default; }\r\n.count-colon {\r\n  font-weight: 800;\r\n  color: var(--home-accent-dim);\r\n  font-size: max(12px, min(7cqw, 15cqh));\r\n}\r\n.count-done {\r\n  margin-top: 3px;\r\n  background: none;\r\n  border: 1px solid var(--home-border);\r\n  border-radius: 6px;\r\n  color: var(--home-accent);\r\n  cursor: pointer;\r\n  font: inherit;\r\n  font-size: 10px;\r\n  letter-spacing: 0.08em;\r\n  text-transform: uppercase;\r\n  padding: 2px 12px;\r\n}\r\n.count-done:hover { border-color: var(--home-accent); }\r\n.home-pomo .pomo-min {\r\n  font-size: min(20cqw, 40cqh);\r\n  font-weight: 800;\r\n  color: var(--home-accent);\r\n  max-width: 70%;\r\n}\r\n/* Hover steppers for the pomodoro work/break lengths. */\r\n.hover-ctl.pomo-set { flex-direction: column; align-items: flex-end; gap: 1px; }\r\n/* Tokens control: ONE row — range stepper, chart/totals toggles, grouping.\r\n * It used to be two stacked lines; it now spans the widget and packs to the\r\n * right (the left edge is set explicitly because .home-widget clips at its\r\n * padding edge), never wraps, and steps its font size down in two container\r\n * tiers instead of breaking into a second line. */\r\n.hover-ctl.tok-set {\r\n  left: 6px;\r\n  right: 6px;\r\n  flex-direction: row;\r\n  flex-wrap: nowrap;\r\n  justify-content: flex-end;\r\n  gap: 3px;\r\n}\r\n/* Natural width on purpose (no min-width:0): at the narrowest widget sizes the\r\n * row overflows the control instead of shrinking, so the trailing grouping\r\n * buttons stay on screen rather than being squeezed out of the clip. */\r\n.tok-line { display: flex; align-items: center; gap: 4px; }\r\n@container (max-width: 430px) {\r\n  .hover-ctl.tok-set { gap: 2px; }\r\n  .hover-ctl.tok-set .hv-label,\r\n  .hover-ctl.tok-set .hv-opt { font-size: 8px; }\r\n}\r\n@container (max-width: 330px) {\r\n  .hover-ctl.tok-set { gap: 1px; }\r\n  .hover-ctl.tok-set .hv-label,\r\n  .hover-ctl.tok-set .hv-opt { font-size: 7px; }\r\n  .hover-ctl.tok-set .hv-opt { padding: 0 2px; }\r\n  .hover-ctl.tok-set .hv-arrow { font-size: 11px; padding: 0 1px; }\r\n}\r\n.pomo-stepper { display: flex; align-items: center; gap: 3px; }\r\n.pomo-stepper .hv-label:nth-child(3) { min-width: 16px; text-align: center; color: var(--home-accent); }\r\n\r\n/* ── calendar ── */\r\n.home-cal { height: calc(100% - 18px); display: flex; flex-direction: column; }\r\n.home-cal-month {\r\n  text-align: center;\r\n  color: var(--home-accent-dim);\r\n  font-size: max(9px, min(3.2cqw, 7cqh));\r\n  letter-spacing: 0.14em;\r\n  text-transform: uppercase;\r\n  margin-bottom: 4px;\r\n}\r\n.home-cal-grid {\r\n  flex: 1;\r\n  display: grid;\r\n  grid-template-columns: repeat(7, 1fr);\r\n  align-content: space-evenly;\r\n  justify-items: center;\r\n  font-size: max(8px, min(3cqw, 6.5cqh));\r\n}\r\n.home-cal-h { color: var(--color-muted-foreground, #6b7387); }\r\n.home-cal-d { color: var(--color-foreground, #d8dce6); opacity: 0.75; }\r\n.home-cal-today {\r\n  color: #000;\r\n  background: var(--home-accent);\r\n  border-radius: 4px;\r\n  padding: 0 4px;\r\n  font-weight: 700;\r\n}\r\n/* Density tiers, chosen from the widget's cell width (see CalendarWidget). */\r\n.home-cal.tier-mini .home-cal-month {\r\n  font-size: max(8px, min(4cqw, 8cqh));\r\n  margin-bottom: 2px;\r\n}\r\n.home-cal.tier-mini .home-cal-grid { font-size: max(9px, min(4cqw, 8cqh)); }\r\n.home-cal.tier-large .home-cal-month {\r\n  font-size: max(11px, min(3cqw, 7cqh));\r\n  margin-bottom: 7px;\r\n}\r\n.home-cal.tier-large .home-cal-grid { row-gap: 3px; }\r\n.home-cal.tier-large .home-cal-h { font-weight: 700; opacity: 0.8; }\r\n.home-cal.tier-large .home-cal-today { padding: 1px 6px; }\r\n\r\n/* ── page chrome ── */\r\n/* Edit affordance lives BELOW the grid, centered. It fades in once the user\r\n * starts scrolling down (or immediately when the grid is short enough that\r\n * there's nothing to scroll), keeping the home clean on first paint. While\r\n * editing it sticks to the bottom of the viewport so it stays reachable. */\r\n.home-editbar {\r\n  display: flex;\r\n  justify-content: center;\r\n  gap: 10px;\r\n  padding: 22px 12px 30px;\r\n  opacity: 0;\r\n  transition: opacity 0.25s ease;\r\n  pointer-events: none;\r\n}\r\n.home-editbar.visible {\r\n  opacity: 1;\r\n  pointer-events: auto;\r\n}\r\n.home-root.editing .home-editbar {\r\n  position: sticky;\r\n  bottom: 0;\r\n}\r\n.home-fab {\r\n  position: relative;\r\n  width: 38px;\r\n  height: 38px;\r\n  border-radius: 50%;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  font-size: 15px;\r\n  cursor: pointer;\r\n  color: var(--home-accent);\r\n  background: var(--home-surface);\r\n  border: 1px solid var(--home-border);\r\n  backdrop-filter: blur(12px);\r\n  -webkit-backdrop-filter: blur(12px);\r\n  transition:\r\n    border-color 0.25s ease,\r\n    background 0.35s ease,\r\n    box-shadow 0.45s ease,\r\n    transform 0.4s cubic-bezier(0.34, 1.4, 0.64, 1);\r\n}\r\n.home-fab:hover {\r\n  border-color: var(--home-accent);\r\n  transform: scale(1.06);\r\n}\r\n.home-fab:active { transform: scale(0.94); }\r\n.home-fab.active {\r\n  background: color-mix(in srgb, var(--home-accent) 22%, transparent);\r\n  /* Warm Hermes glow ring when edit mode engages. */\r\n  animation: home-fab-glow 0.55s ease-out;\r\n}\r\n\r\n/* Crossfading edit ✎ ↔ done ✓ glyphs — each rotates and scales through the\r\n * swap with a gentle overshoot, matching the dashboard's soft motion. */\r\n.home-fab-ico {\r\n  position: absolute;\r\n  inset: 0;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  transition:\r\n    opacity 0.3s ease,\r\n    transform 0.45s cubic-bezier(0.34, 1.45, 0.64, 1);\r\n}\r\n.ico-edit { opacity: 1; transform: rotate(0) scale(1); }\r\n.ico-done { opacity: 0; transform: rotate(-120deg) scale(0.3); }\r\n.home-fab.active .ico-edit { opacity: 0; transform: rotate(120deg) scale(0.3); }\r\n.home-fab.active .ico-done { opacity: 1; transform: rotate(0) scale(1); }\r\n\r\n.home-fab-spin {\r\n  display: inline-block;\r\n  animation: home-fab-spin-in 0.5s cubic-bezier(0.34, 1.4, 0.64, 1);\r\n}\r\n\r\n/* The restore-default button slides up into place, like the dashboard's\r\n * dialog-in entrance. */\r\n.home-fab-enter {\r\n  animation: home-fab-enter 0.32s cubic-bezier(0.34, 1.3, 0.64, 1);\r\n}\r\n\r\n@keyframes home-fab-glow {\r\n  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--home-accent) 55%, transparent); }\r\n  100% { box-shadow: 0 0 0 13px transparent; }\r\n}\r\n@keyframes home-fab-spin-in {\r\n  from { transform: rotate(-150deg); opacity: 0.3; }\r\n  to   { transform: rotate(0); opacity: 1; }\r\n}\r\n@keyframes home-fab-enter {\r\n  from { opacity: 0; transform: translateY(6px) scale(0.9); }\r\n  to   { opacity: 1; transform: translateY(0) scale(1); }\r\n}\r\n\r\n@media (prefers-reduced-motion: reduce) {\r\n  .home-fab,\r\n  .home-fab-ico,\r\n  .home-fab-spin,\r\n  .home-fab-enter { animation: none; transition: opacity 0.2s ease; }\r\n}\r\n\r\n/* ── toast (plugin-local; the host toast isn't exposed in the SDK) ── */\r\n.home-toast {\r\n  position: fixed;\r\n  bottom: 18px;\r\n  left: 50%;\r\n  transform: translateX(-50%);\r\n  z-index: 80;\r\n  padding: 8px 16px;\r\n  border-radius: 8px;\r\n  font-size: 12px;\r\n  color: var(--home-error, #e25555);\r\n  background: var(--home-surface);\r\n  border: 1px solid var(--home-error, #e25555);\r\n  backdrop-filter: blur(12px);\r\n  -webkit-backdrop-filter: blur(12px);\r\n  box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);\r\n  animation: home-toast-in 0.25s ease;\r\n}\r\n@keyframes home-toast-in {\r\n  from { opacity: 0; transform: translateX(-50%) translateY(8px); }\r\n  to { opacity: 1; transform: translateX(-50%) translateY(0); }\r\n}\r\n\r\n/* Catalog reveal: the wrapper animates its row track 0fr → 1fr so the panel\r\n * grows/collapses its real height smoothly (no grid jump), with a matching\r\n * fade. Kept mounted so the exit animates too. */\r\n.home-catalog-wrap {\r\n  display: grid;\r\n  grid-template-rows: 0fr;\r\n  margin: 0 12px;\r\n  opacity: 0;\r\n  pointer-events: none;\r\n  transition:\r\n    grid-template-rows 0.34s cubic-bezier(0.34, 1.2, 0.64, 1),\r\n    opacity 0.28s ease,\r\n    margin-bottom 0.34s ease;\r\n}\r\n.home-catalog-wrap.open {\r\n  grid-template-rows: 1fr;\r\n  opacity: 1;\r\n  pointer-events: auto;\r\n  margin-bottom: 8px;\r\n}\r\n.home-catalog {\r\n  overflow: hidden;\r\n  min-height: 0;\r\n  border-radius: 8px;\r\n  background: var(--home-surface);\r\n  border: 1px solid var(--home-border);\r\n  backdrop-filter: blur(12px);\r\n  -webkit-backdrop-filter: blur(12px);\r\n  transition: border-color 0.2s ease, background 0.2s ease;\r\n}\r\n/* Highlighted as a delete target while a widget is dragged over it. */\r\n.home-catalog-wrap.trash-active .home-catalog {\r\n  border-color: var(--home-error);\r\n  border-style: dashed;\r\n  background: color-mix(in srgb, var(--home-error) 10%, var(--home-surface));\r\n}\r\n.home-catalog-inner {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  align-items: center;\r\n  gap: 8px;\r\n  padding: 10px;\r\n}\r\n.home-catalog-hint {\r\n  font-size: 10px;\r\n  letter-spacing: 0.04em;\r\n  color: var(--color-muted-foreground, #6b7387);\r\n  margin-right: 4px;\r\n}\r\n.home-catalog-wrap.trash-active .home-catalog-hint { color: var(--home-error); }\r\n.home-catalog-chip { touch-action: none; }\r\n.home-catalog-chip {\r\n  font-family: inherit;\r\n  font-size: 11px;\r\n  padding: 4px 10px;\r\n  border-radius: 6px;\r\n  cursor: pointer;\r\n  background: none;\r\n  border: 1px dashed var(--home-border);\r\n  color: var(--color-foreground, #d8dce6);\r\n  transition: border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;\r\n}\r\n.home-catalog-chip:hover {\r\n  border-color: var(--home-accent);\r\n  color: var(--home-accent);\r\n  transform: translateY(-1px);\r\n}\r\n.home-catalog-chip:active { transform: scale(0.95); }\r\n.home-catalog .empty { color: var(--color-muted-foreground, #6b7387); font-size: 11px; }\r\n\r\n@media (prefers-reduced-motion: reduce) {\r\n  .home-catalog-wrap { transition: opacity 0.2s ease; }\r\n}\r\n\r\n/* ── Agent widget (the eye) ─────────────────────────────────────────── */\r\n\r\n.home-agent {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n  /* The .hd header sits above in the same content box (same as the other\r\n   * widgets' calc) — 100% pushed the stats row 8px past the bottom edge. */\r\n  height: calc(100% - 21px);\r\n  min-height: 0;\r\n  overflow: hidden;\r\n  font-size: 11px;\r\n  box-sizing: border-box;\r\n}\r\n\r\n/* The animated scene owns the leftover space and centers its content\r\n * vertically; head/stats/history are fixed rows that never move or\r\n * overflow. flex-basis: 0 — the scene shrinks to zero before the fixed\r\n * rows are ever pushed out. */\r\n.home-agent-scene {\r\n  flex: 1 1 0;\r\n  min-height: 0;\r\n  display: flex;\r\n  align-items: center;\r\n  overflow: hidden;\r\n}\r\n\r\n.home-agent-head {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  flex-wrap: wrap;\r\n  min-height: 18px;\r\n  flex: none;\r\n}\r\n\r\n.home-agent-dot {\r\n  width: 8px;\r\n  height: 8px;\r\n  border-radius: 50%;\r\n  background: var(--home-accent);\r\n  opacity: 0.45;\r\n  flex: none;\r\n  box-shadow: 0 0 6px var(--home-accent);\r\n}\r\n.home-agent-dot.busy {\r\n  opacity: 1;\r\n  animation: home-agent-pulse 1.2s ease-in-out infinite;\r\n}\r\n@keyframes home-agent-pulse {\r\n  0%, 100% { opacity: 1; transform: scale(1); }\r\n  50% { opacity: 0.35; transform: scale(0.8); }\r\n}\r\n\r\n.home-agent-status {\r\n  text-transform: uppercase;\r\n  letter-spacing: 0.08em;\r\n  font-size: 10px;\r\n  color: var(--color-foreground, #d8dce6);\r\n}\r\n\r\n.home-agent-take {\r\n  background: none;\r\n  border: none;\r\n  cursor: pointer;\r\n  font-family: inherit;\r\n  font-size: 9px;\r\n  letter-spacing: 0.08em;\r\n  text-transform: uppercase;\r\n  color: var(--home-accent-dim);\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 5px;\r\n  padding: 1px 5px;\r\n  border-radius: 4px;\r\n  white-space: nowrap;\r\n}\r\n.home-agent-take:hover { color: var(--home-accent); background: color-mix(in srgb, var(--home-accent) 10%, transparent); }\r\n.home-agent-take:active { transform: scale(0.95); }\r\n\r\n/* Play triangle, pure CSS — no emoji. */\r\n.home-agent-take-ico {\r\n  width: 0;\r\n  height: 0;\r\n  border-left: 4.5px solid currentColor;\r\n  border-top: 3px solid transparent;\r\n  border-bottom: 3px solid transparent;\r\n}\r\n\r\n.home-agent-line {\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n  min-width: 0;\r\n}\r\n\r\n.home-agent-toolbox {\r\n  display: flex;\r\n  gap: 6px;\r\n  align-items: baseline;\r\n}\r\n.home-agent-k {\r\n  color: var(--home-accent);\r\n  flex: none;\r\n}\r\n.home-agent-dim { color: var(--color-muted-foreground, #6b7387); }\r\n\r\n.home-agent-msg {\r\n  color: var(--color-muted-foreground, #8b93a7);\r\n  font-style: italic;\r\n  max-height: 42px;\r\n  white-space: normal;\r\n  overflow: hidden;\r\n  display: -webkit-box;\r\n  -webkit-line-clamp: 2;\r\n  -webkit-box-orient: vertical;\r\n}\r\n\r\n.home-agent-stats {\r\n  display: flex;\r\n  gap: 10px;\r\n  flex-wrap: wrap;\r\n  font-size: 10px;\r\n  color: var(--color-foreground, #d8dce6);\r\n  border-top: 1px solid var(--home-border);\r\n  padding-top: 5px;\r\n  /* Shrinkable last: the scene compresses first (flex-basis 0), then this\r\n     row and the history may compress instead of overflowing the widget. */\r\n  flex: 0 1 auto;\r\n  min-height: 0;\r\n  overflow: hidden;\r\n}\r\n.home-agent-stats span {\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  min-width: 0;\r\n}\r\n.home-agent-stats i {\r\n  font-style: normal;\r\n  color: var(--color-muted-foreground, #6b7387);\r\n  font-size: 9px;\r\n}\r\n\r\n.home-agent-history {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 4px 10px;\r\n  max-height: 40px;\r\n  overflow: hidden;\r\n  flex: 0 1 auto;\r\n  min-height: 0;\r\n}\r\n.home-agent-hist {\r\n  font-size: 10px;\r\n  color: var(--color-muted-foreground, #8b93a7);\r\n  display: inline-flex;\r\n  gap: 4px;\r\n  align-items: center;\r\n}\r\n.home-agent-hist-dot {\r\n  width: 5px;\r\n  height: 5px;\r\n  border-radius: 50%;\r\n  flex: none;\r\n}\r\n.home-agent-hist-dot.ok { background: #2dd4bf; }\r\n.home-agent-hist-dot.bad { background: var(--home-error); }\r\n.home-agent-hist i {\r\n  font-style: normal;\r\n  font-size: 9px;\r\n  color: var(--color-muted-foreground, #6b7387);\r\n}\r\n\r\n/* ── Agent theater (take-control fullscreen) ───────────────────────── */\r\n\r\n.home-theater {\r\n  position: fixed;\r\n  inset: 0;\r\n  z-index: 1000;\r\n  background: color-mix(in srgb, var(--ui-editor-surface-background, rgb(8 8 12 / 1)) 92%, #000);\r\n  backdrop-filter: blur(18px);\r\n  -webkit-backdrop-filter: blur(18px);\r\n  display: flex;\r\n  flex-direction: column;\r\n  padding: 18px 22px 22px;\r\n  gap: 14px;\r\n  overflow: auto;\r\n  font-family: var(--theme-font-mono, ui-monospace, monospace);\r\n  color: var(--color-foreground, #d8dce6);\r\n  animation: home-theater-in 0.22s ease;\r\n}\r\n@keyframes home-theater-in {\r\n  from { opacity: 0; transform: scale(0.985); }\r\n  to { opacity: 1; transform: scale(1); }\r\n}\r\n\r\n.home-theater-head {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 10px;\r\n  border-bottom: 1px solid var(--home-border);\r\n  padding-bottom: 10px;\r\n  flex: none;\r\n}\r\n\r\n.home-theater-title {\r\n  font-size: 13px;\r\n  letter-spacing: 0.14em;\r\n  color: var(--home-accent);\r\n}\r\n\r\n.home-theater-sub {\r\n  font-size: 10px;\r\n  color: var(--color-muted-foreground, #6b7387);\r\n  text-transform: uppercase;\r\n  letter-spacing: 0.06em;\r\n}\r\n\r\n.home-theater-release {\r\n  margin-left: auto;\r\n  background: transparent;\r\n  border: 1px solid var(--home-border);\r\n  color: var(--color-foreground, #d8dce6);\r\n  border-radius: 6px;\r\n  font-size: 11px;\r\n  font-family: inherit;\r\n  padding: 4px 12px;\r\n  cursor: pointer;\r\n  transition: border-color 0.15s ease, color 0.15s ease;\r\n}\r\n.home-theater-release:hover {\r\n  border-color: var(--home-error);\r\n  color: var(--home-error);\r\n}\r\n\r\n.home-theater-grid {\r\n  display: grid;\r\n  grid-template-columns: repeat(12, 1fr);\r\n  gap: 12px;\r\n  flex: 1;\r\n  min-height: 0;\r\n  align-content: start;\r\n}\r\n.home-theater-span-5 { grid-column: span 5; }\r\n.home-theater-span-7 { grid-column: span 7; }\r\n.home-theater-span-12 { grid-column: span 12; }\r\n@media (max-width: 900px) {\r\n  .home-theater-span-5, .home-theater-span-7, .home-theater-span-12 { grid-column: span 12; }\r\n}\r\n\r\n.home-theater-panel {\r\n  background: var(--home-surface);\r\n  border: 1px solid var(--home-border);\r\n  border-radius: 10px;\r\n  padding: 12px 14px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 8px;\r\n  min-height: 160px;\r\n  max-height: 420px;\r\n  overflow: hidden;\r\n  box-shadow: 0 10px 30px rgb(0 0 0 / 0.35);\r\n}\r\n\r\n.home-theater-panel-title {\r\n  font-size: 10px;\r\n  letter-spacing: 0.12em;\r\n  color: var(--color-muted-foreground, #6b7387);\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 7px;\r\n  flex: none;\r\n  text-transform: uppercase;\r\n}\r\n.home-theater-dim {\r\n  color: var(--color-muted-foreground, #6b7387);\r\n  font-size: 10px;\r\n  font-style: italic;\r\n}\r\n\r\n/* NOW panel */\r\n.home-theater-current-tool {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 3px;\r\n  background: color-mix(in srgb, var(--home-accent) 8%, transparent);\r\n  border: 1px solid var(--home-border);\r\n  border-radius: 8px;\r\n  padding: 8px 10px;\r\n  flex: none;\r\n}\r\n.home-theater-ct-name {\r\n  color: var(--home-accent);\r\n  font-size: 12px;\r\n}\r\n.home-theater-ct-args {\r\n  font-size: 10px;\r\n  color: var(--color-muted-foreground, #8b93a7);\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.home-theater-stream {\r\n  font-size: 11px;\r\n  line-height: 1.55;\r\n  color: var(--color-foreground, #d8dce6);\r\n  background: color-mix(in srgb, var(--home-accent) 4%, transparent);\r\n  border-left: 2px solid var(--home-accent);\r\n  padding: 6px 10px;\r\n  border-radius: 0 6px 6px 0;\r\n  max-height: 110px;\r\n  overflow: auto;\r\n  flex: none;\r\n  white-space: pre-wrap;\r\n  word-break: break-word;\r\n}\r\n\r\n.home-theater-feed {\r\n  flex: 1;\r\n  min-height: 0;\r\n  overflow: auto;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n  font-size: 10.5px;\r\n}\r\n.home-theater-feed-row {\r\n  display: flex;\r\n  gap: 8px;\r\n  align-items: baseline;\r\n  padding: 1px 0;\r\n  border-bottom: 1px solid color-mix(in srgb, var(--home-border) 40%, transparent);\r\n  animation: home-feed-in 0.32s ease-out both;\r\n}\r\n.home-theater-feed-time {\r\n  color: var(--color-muted-foreground, #555d70);\r\n  flex: none;\r\n  font-size: 9.5px;\r\n}\r\n/* Kind dot, pure CSS — no emoji. */\r\n.home-theater-feed-kind {\r\n  flex: none;\r\n  width: 6px;\r\n  height: 6px;\r\n  border-radius: 50%;\r\n  align-self: center;\r\n}\r\n.home-theater-feed-kind.tool { background: var(--home-accent); }\r\n.home-theater-feed-kind.message { background: #2dd4bf; }\r\n.home-theater-feed-kind.subagent { background: #a78bfa; }\r\n.home-theater-feed-kind.system { background: var(--color-muted-foreground, #6b7387); }\r\n.home-theater-feed-kind.bad { background: var(--home-error); }\r\n.home-theater-feed-label {\r\n  color: var(--color-foreground, #d8dce6);\r\n  flex: none;\r\n}\r\n.home-theater-feed-detail {\r\n  color: var(--color-muted-foreground, #8b93a7);\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n  min-width: 0;\r\n}\r\n\r\n.home-theater-foot {\r\n  display: flex;\r\n  gap: 14px;\r\n  font-size: 9.5px;\r\n  color: var(--color-muted-foreground, #555d70);\r\n  text-transform: uppercase;\r\n  letter-spacing: 0.06em;\r\n  flex: none;\r\n  border-top: 1px solid var(--home-border);\r\n  padding-top: 6px;\r\n}\r\n\r\n/* FUNCTION panel */\r\n.home-theater-fn-current {\r\n  background: color-mix(in srgb, var(--home-accent) 8%, transparent);\r\n  border: 1px solid var(--home-border);\r\n  border-radius: 8px;\r\n  padding: 8px 10px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n  flex: none;\r\n}\r\n.home-theater-fn-name {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  font-size: 12px;\r\n  color: var(--home-accent);\r\n}\r\n.home-theater-fn-dot {\r\n  width: 6px;\r\n  height: 6px;\r\n  border-radius: 50%;\r\n  flex: none;\r\n}\r\n.home-theater-fn-dot.running {\r\n  background: var(--home-accent);\r\n  animation: home-agent-pulse 1.2s ease-in-out infinite;\r\n}\r\n.home-theater-fn-dot.ok { background: #2dd4bf; }\r\n.home-theater-fn-dot.bad { background: var(--home-error); }\r\n.home-theater-fn-state {\r\n  margin-left: auto;\r\n  font-size: 9px;\r\n  text-transform: uppercase;\r\n  letter-spacing: 0.08em;\r\n  padding: 1px 8px;\r\n  border-radius: 20px;\r\n  border: 1px solid;\r\n}\r\n.home-theater-fn-state.running {\r\n  color: var(--home-accent);\r\n  border-color: var(--home-accent);\r\n}\r\n.home-theater-fn-args {\r\n  font-size: 10px;\r\n  color: var(--color-muted-foreground, #8b93a7);\r\n  white-space: pre-wrap;\r\n  word-break: break-word;\r\n  max-height: 120px;\r\n  overflow: auto;\r\n  margin: 0;\r\n  font-family: inherit;\r\n}\r\n\r\n.home-theater-fn-history {\r\n  flex: 1;\r\n  min-height: 0;\r\n  overflow: auto;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n  font-size: 10.5px;\r\n}\r\n.home-theater-fn-row {\r\n  display: flex;\r\n  gap: 8px;\r\n  align-items: baseline;\r\n  border-bottom: 1px solid color-mix(in srgb, var(--home-border) 40%, transparent);\r\n  padding: 2px 0;\r\n}\r\n.home-theater-fn-hname { color: var(--color-foreground, #d8dce6); flex: none; }\r\n.home-theater-fn-hargs {\r\n  color: var(--color-muted-foreground, #8b93a7);\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n  min-width: 0;\r\n}\r\n.home-theater-fn-hdur {\r\n  margin-left: auto;\r\n  color: var(--color-muted-foreground, #6b7387);\r\n  flex: none;\r\n  font-size: 9.5px;\r\n}\r\n\r\n/* TOKENS & COST panel */\r\n.home-theater-tok-grid {\r\n  display: grid;\r\n  grid-template-columns: repeat(2, 1fr);\r\n  gap: 8px;\r\n}\r\n.home-theater-tok-cell {\r\n  background: color-mix(in srgb, var(--home-accent) 5%, transparent);\r\n  border: 1px solid var(--home-border);\r\n  border-radius: 8px;\r\n  padding: 8px 10px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n}\r\n.home-theater-tok-num {\r\n  font-size: 15px;\r\n  color: var(--color-foreground, #d8dce6);\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n.home-theater-tok-num.home-theater-money { color: var(--home-accent); }\r\n.home-theater-tok-lbl {\r\n  font-size: 9px;\r\n  text-transform: uppercase;\r\n  letter-spacing: 0.07em;\r\n  color: var(--color-muted-foreground, #6b7387);\r\n}\r\n\r\n.home-theater-tok-models {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 3px;\r\n  font-size: 10px;\r\n  border-top: 1px solid var(--home-border);\r\n  padding-top: 6px;\r\n}\r\n.home-theater-tok-model {\r\n  display: flex;\r\n  gap: 10px;\r\n  align-items: baseline;\r\n}\r\n.home-theater-tok-mname { color: var(--color-foreground, #d8dce6); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\r\n.home-theater-tok-mtok { color: var(--color-muted-foreground, #8b93a7); margin-left: auto; }\r\n.home-theater-tok-mcost { color: var(--home-accent); flex: none; }\r\n\r\n.home-theater-tok-session {\r\n  border-top: 1px solid var(--home-border);\r\n  padding-top: 6px;\r\n  font-size: 10px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n  min-width: 0;\r\n}\r\n.home-theater-tok-slbl {\r\n  font-size: 9px;\r\n  text-transform: uppercase;\r\n  letter-spacing: 0.07em;\r\n  color: var(--color-muted-foreground, #6b7387);\r\n}\r\n.home-theater-tok-stitle {\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.home-theater-tok-snum {\r\n  color: var(--color-muted-foreground, #8b93a7);\r\n  white-space: nowrap;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n\r\n/* PROJECT panel */\r\n.home-theater-proj-session {\r\n  background: color-mix(in srgb, var(--home-accent) 5%, transparent);\r\n  border: 1px solid var(--home-border);\r\n  border-radius: 8px;\r\n  padding: 8px 10px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n}\r\n.home-theater-proj-title { font-size: 12px; color: var(--color-foreground, #d8dce6); }\r\n.home-theater-proj-meta {\r\n  font-size: 9.5px;\r\n  color: var(--color-muted-foreground, #6b7387);\r\n}\r\n\r\n.home-theater-proj-files {\r\n  flex: 1;\r\n  min-height: 0;\r\n  overflow: auto;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n  font-size: 10.5px;\r\n}\r\n.home-theater-proj-file {\r\n  display: flex;\r\n  gap: 8px;\r\n  align-items: baseline;\r\n  border-bottom: 1px solid color-mix(in srgb, var(--home-border) 40%, transparent);\r\n  padding: 2px 0;\r\n}\r\n.home-theater-proj-glyph {\r\n  color: var(--home-accent);\r\n  flex: none;\r\n  font-size: 9px;\r\n  width: 16px;\r\n  text-align: center;\r\n}\r\n.home-theater-proj-path {\r\n  color: var(--color-muted-foreground, #8b93a7);\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.home-theater-proj-subagents {\r\n  border-top: 1px solid var(--home-border);\r\n  padding-top: 6px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 3px;\r\n  font-size: 10px;\r\n}\r\n.home-theater-proj-subagent { display: flex; gap: 8px; align-items: baseline; }\r\n.home-theater-proj-subdot {\r\n  width: 6px;\r\n  height: 6px;\r\n  border-radius: 50%;\r\n  flex: none;\r\n  align-self: center;\r\n}\r\n.home-theater-proj-subdot.run { background: var(--home-accent); animation: home-agent-pulse 1.2s ease-in-out infinite; }\r\n.home-theater-proj-subdot.done { background: #2dd4bf; }\r\n.home-theater-proj-subname { color: var(--color-foreground, #d8dce6); }\r\n.home-theater-proj-subgoal {\r\n  color: var(--color-muted-foreground, #6b7387);\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n/* RECOMMENDATIONS panel */\r\n.home-theater-rec-list {\r\n  flex: 1;\r\n  min-height: 0;\r\n  overflow: auto;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 6px;\r\n}\r\n.home-theater-rec {\r\n  display: flex;\r\n  gap: 10px;\r\n  align-items: flex-start;\r\n  border: 1px solid var(--home-border);\r\n  border-radius: 8px;\r\n  padding: 7px 10px;\r\n  background: color-mix(in srgb, var(--home-surface) 60%, transparent);\r\n}\r\n.home-theater-rec.warn { border-color: color-mix(in srgb, #e8b33c 45%, transparent); }\r\n.home-theater-rec.crit { border-color: color-mix(in srgb, var(--home-error) 55%, transparent); }\r\n.home-theater-rec-tag {\r\n  flex: none;\r\n  width: 18px;\r\n  height: 18px;\r\n  border-radius: 50%;\r\n  display: grid;\r\n  place-items: center;\r\n  font-size: 10px;\r\n  margin-top: 1px;\r\n}\r\n.home-theater-rec.info .home-theater-rec-tag {\r\n  color: var(--home-accent);\r\n  border: 1px solid var(--home-accent);\r\n}\r\n.home-theater-rec.warn .home-theater-rec-tag {\r\n  color: #e8b33c;\r\n  border: 1px solid #e8b33c;\r\n}\r\n.home-theater-rec.crit .home-theater-rec-tag {\r\n  color: var(--home-error);\r\n  border: 1px solid var(--home-error);\r\n}\r\n.home-theater-rec-body { min-width: 0; }\r\n.home-theater-rec-title { font-size: 11px; color: var(--color-foreground, #d8dce6); }\r\n.home-theater-rec-detail {\r\n  font-size: 10px;\r\n  color: var(--color-muted-foreground, #8b93a7);\r\n  margin-top: 1px;\r\n}\r\n\r\n/* ── Live scene — the animated centerpiece ────────────────────────────\r\n * On identity change: the outgoing content slides up while fading, the\r\n * incoming content rises from below with a blur that dissolves as it\r\n * settles. */\r\n\r\n.home-theater-scene {\r\n  flex: 1 1 auto;\r\n  min-height: 0;\r\n  display: flex;\r\n  align-items: center;\r\n  overflow: hidden;\r\n}\r\n\r\n.home-scene {\r\n  position: relative;\r\n  width: 100%;\r\n}\r\n\r\n.home-scene-item {\r\n  animation: home-scene-in 0.42s ease-out both;\r\n}\r\n\r\n.home-scene-item.leaving {\r\n  position: absolute;\r\n  inset-inline: 0;\r\n  top: 0;\r\n  animation: home-scene-out 0.4s ease-in forwards;\r\n  pointer-events: none;\r\n}\r\n\r\n@keyframes home-scene-in {\r\n  from {\r\n    opacity: 0;\r\n    transform: translateY(26px);\r\n    filter: blur(6px);\r\n  }\r\n  to {\r\n    opacity: 1;\r\n    transform: translateY(0);\r\n    filter: blur(0);\r\n  }\r\n}\r\n\r\n@keyframes home-scene-out {\r\n  from {\r\n    opacity: 1;\r\n    transform: translateY(0);\r\n    filter: blur(0);\r\n  }\r\n  to {\r\n    opacity: 0;\r\n    transform: translateY(-26px);\r\n    filter: blur(4px);\r\n  }\r\n}\r\n\r\n@keyframes home-feed-in {\r\n  from { opacity: 0; transform: translateY(7px); }\r\n  to { opacity: 1; transform: translateY(0); }\r\n}\r\n\r\n@keyframes home-caret-blink {\r\n  0%, 45% { opacity: 1; }\r\n  50%, 100% { opacity: 0; }\r\n}\r\n\r\n/* Scene content — tool call */\r\n.home-scene-tool {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 4px;\r\n  min-width: 0;\r\n}\r\n.home-scene-title {\r\n  color: var(--home-accent);\r\n  font-size: 12px;\r\n  font-weight: 600;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n.home-scene-meta {\r\n  font-size: 9px;\r\n  text-transform: uppercase;\r\n  letter-spacing: 0.08em;\r\n  color: var(--color-muted-foreground, #6b7387);\r\n}\r\n.home-scene-args {\r\n  margin: 0;\r\n  font-family: inherit;\r\n  font-size: 10px;\r\n  color: var(--color-muted-foreground, #8b93a7);\r\n  white-space: pre-wrap;\r\n  word-break: break-word;\r\n  max-height: 90px;\r\n  overflow: auto;\r\n}\r\n\r\n/* Scene content — message (markdown-rendered) */\r\n.home-scene-msg {\r\n  font-size: 11.5px;\r\n  line-height: 1.6;\r\n  color: var(--color-foreground, #d8dce6);\r\n  word-break: break-word;\r\n  max-height: 150px;\r\n  overflow: auto;\r\n}\r\n.home-scene-msg strong {\r\n  color: var(--home-accent);\r\n  font-weight: 650;\r\n}\r\n.home-scene-msg em { font-style: italic; }\r\n.home-scene-msg code {\r\n  font-family: var(--theme-font-mono, ui-monospace, monospace);\r\n  font-size: 0.92em;\r\n  color: var(--home-accent);\r\n  background: color-mix(in srgb, var(--home-accent) 10%, transparent);\r\n  padding: 0 4px;\r\n  border-radius: 4px;\r\n  white-space: pre-wrap;\r\n}\r\n.home-scene-msg .home-md-pre {\r\n  margin: 4px 0;\r\n  background: color-mix(in srgb, var(--home-accent) 5%, transparent);\r\n  border: 1px solid var(--home-border);\r\n  border-left: 2px solid var(--home-accent);\r\n  border-radius: 0 6px 6px 0;\r\n  padding: 6px 10px;\r\n  overflow: auto;\r\n  max-height: 120px;\r\n}\r\n.home-scene-msg .home-md-pre code {\r\n  background: none;\r\n  padding: 0;\r\n  color: var(--color-muted-foreground, #9aa3b8);\r\n  font-size: 10px;\r\n  line-height: 1.5;\r\n  white-space: pre;\r\n}\r\n.home-scene-msg .home-md-h {\r\n  color: var(--home-accent);\r\n  font-weight: 650;\r\n  margin: 3px 0 1px;\r\n}\r\n.home-scene-msg .home-md-h.h1 { font-size: 13px; letter-spacing: 0.02em; }\r\n.home-scene-msg .home-md-h.h2 { font-size: 12px; }\r\n.home-scene-msg .home-md-h.h3 { font-size: 11px; }\r\n.home-scene-msg .home-md-p { margin: 2px 0; }\r\n.home-scene-msg .home-md-gap { height: 4px; }\r\n.home-scene-msg .home-md-list { margin: 2px 0; display: flex; flex-direction: column; gap: 1px; }\r\n.home-scene-msg .home-md-li {\r\n  padding-left: 14px;\r\n  position: relative;\r\n}\r\n.home-scene-msg .home-md-li::before {\r\n  content: \"\";\r\n  position: absolute;\r\n  left: 3px;\r\n  top: 0.62em;\r\n  width: 5px;\r\n  height: 5px;\r\n  border-radius: 50%;\r\n  background: var(--home-accent);\r\n  opacity: 0.8;\r\n}\r\n.home-scene-caret {\r\n  display: inline-block;\r\n  width: 6px;\r\n  height: 13px;\r\n  margin-left: 2px;\r\n  vertical-align: -2px;\r\n  background: var(--home-accent);\r\n  animation: home-caret-blink 1s steps(1) infinite;\r\n}\r\n\r\n/* Scene content — idle */\r\n.home-scene-idle {\r\n  font-size: 10px;\r\n  font-style: italic;\r\n  color: var(--color-muted-foreground, #6b7387);\r\n}\r\n\r\n/* Compact scene (widget body) */\r\n.home-agent-scene .home-scene {\r\n  display: flex;\r\n  min-height: 0;\r\n  overflow: hidden;\r\n}\r\n.home-agent-scene .home-scene-item {\r\n  min-width: 0;\r\n  min-height: 0;\r\n  flex: 1;\r\n}\r\n.home-agent-scene .home-scene-msg {\r\n  font-size: 10.5px;\r\n  max-height: 64px;\r\n  overflow: hidden;\r\n}\r\n.home-agent-scene .home-scene-tool {\r\n  gap: 2px;\r\n}\r\n.home-agent-scene .home-scene-title {\r\n  font-size: 11px;\r\n}\r\n.home-agent-scene .home-scene-args {\r\n  font-size: 10px;\r\n  max-height: 36px;\r\n  white-space: nowrap;\r\n  text-overflow: ellipsis;\r\n  overflow: hidden;\r\n}\r\n.home-agent-scene .home-scene-meta,\r\n.home-agent-scene .home-scene-idle {\r\n  font-size: 9.5px;\r\n}\r\n";
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
    getModelsAnalytics: (days) => ctx.rest(query("/analytics/models", { days })),
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
