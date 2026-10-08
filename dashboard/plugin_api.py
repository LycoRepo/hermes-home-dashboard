"""Home dashboard plugin backend.

Mounted at /api/plugins/home-dashboard/ by the Hermes dashboard host.
Persists the widget layout to a JSON file inside the plugin's own directory
so it survives Hermes updates (the plugin lives under ~/.hermes/plugins/,
outside the repo that `git reset --hard` touches).
"""
from __future__ import annotations

import asyncio
import json
import sqlite3
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, List

try:
    from hermes_constants import get_hermes_home
except ImportError:  # pragma: no cover - allows standalone unit tests
    import os as _os

    def get_hermes_home() -> Path:  # type: ignore[misc]
        val = (_os.environ.get("HERMES_HOME") or "").strip()
        return Path(val) if val else Path.home() / ".hermes"

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel
except Exception:  # pragma: no cover - allows local unit tests
    class APIRouter:  # type: ignore
        def get(self, *_a, **_k):
            return lambda fn: fn

        def put(self, *_a, **_k):
            return lambda fn: fn

    class BaseModel:  # type: ignore
        pass

    class HTTPException(Exception):  # type: ignore
        def __init__(self, status_code: int, detail: str = "") -> None:
            self.status_code = status_code
            self.detail = detail


router = APIRouter()

LAYOUT_FILE = get_hermes_home() / "plugins" / "home-dashboard" / "layout.json"
_MAX_WIDGETS = 64


def _valid_layout(layout: Any) -> bool:
    if not isinstance(layout, dict) or layout.get("version") != 1:
        return False
    widgets = layout.get("widgets")
    if not isinstance(widgets, list) or len(widgets) > _MAX_WIDGETS:
        return False
    for w in widgets:
        if not isinstance(w, dict) or not isinstance(w.get("id"), str):
            return False
        if not all(isinstance(w.get(k), int) for k in ("gx", "gy", "gw", "gh")):
            return False
    return True


@router.get("/layout")
async def get_layout() -> Dict[str, Any]:
    """Return the saved layout, or {"layout": null} for the client default."""
    if LAYOUT_FILE.exists():
        try:
            data = json.loads(LAYOUT_FILE.read_text("utf-8"))
            if _valid_layout(data):
                return {"layout": data}
        except Exception:
            pass
    return {"layout": None}


class LayoutBody(BaseModel):
    layout: dict


@router.put("/layout")
async def set_layout(body: "LayoutBody") -> Dict[str, Any]:
    """Persist the widget layout (positions/sizes/per-widget props)."""
    if not _valid_layout(body.layout):
        raise HTTPException(status_code=400, detail="invalid layout document")
    LAYOUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    LAYOUT_FILE.write_text(json.dumps(body.layout), encoding="utf-8")
    return {"ok": True}


# Hermes Desktop deliberately exposes plugin-scoped REST instead of a generic
# core-API escape hatch.  These read-only routes adapt the same current Hermes
# services the web dashboard uses, keeping the Desktop bundle inside its public
# ``ctx.rest`` boundary while preserving the richer Home widgets.
@router.get("/system")
async def get_desktop_system() -> Dict[str, Any]:
    from hermes_cli.web_routers.status import get_system_stats

    return await get_system_stats()


@router.get("/analytics")
async def get_desktop_analytics(days: int = 30, profile: str | None = None) -> Dict[str, Any]:
    from hermes_cli.web_routers.analytics import get_usage_analytics

    return await get_usage_analytics(days=max(1, min(365, days)), profile=profile)


@router.get("/analytics/models")
async def get_desktop_models_analytics(days: int = 30, profile: str | None = None) -> Dict[str, Any]:
    from hermes_cli.web_routers.analytics import get_models_analytics

    return await get_models_analytics(days=max(1, min(365, days)), profile=profile)


# ── grouped Tokens view: per-day × model/provider, read-only ─────────────
#
# The core has no "per day × model" endpoint (``get_models_analytics`` is
# window-cumulative, ``get_usage_analytics``'s ``daily`` is per-day totals
# only), so the grouped charts aggregate here.
#
# The window and date semantics MUST stay identical to the core's daily
# buckets (``hermes_cli/web_routers/analytics.py``): same cutoff expression
# (``time.time() - days * 86400``) and same ``started_at > cutoff``, and the
# same local calendar day (``date(started_at, 'unixepoch', 'localtime')``).
# Only then does "a day's stacked columns add up" equal that day's bar in the
# day view.  Rows are restricted to the primary usage (``task = ''``): the
# auxiliary rows (vision / compression / title, ...) are not part of the day
# view's totals, so including them would put the two views on different rulers.
_SERIES_SQL = """
    SELECT date(s.started_at, 'unixepoch', 'localtime') AS day,
           u.model AS model,
           COALESCE(u.billing_provider, '') AS provider,
           COALESCE(SUM(u.input_tokens + u.output_tokens), 0) AS tok
    FROM session_model_usage u JOIN sessions s ON s.id = u.session_id
    WHERE s.started_at > :cutoff AND COALESCE(u.task, '') = ''
    GROUP BY day, u.model, u.billing_provider
"""


def _series_db_path(profile: str | None) -> Path:
    """Path of the state store this profile reads — asked of the core, so the
    ``profile`` semantics stay in one place. The import happens inside the
    call and is guarded: a renamed/moved core helper must never break plugin
    loading (1.4.0 shipped exactly that failure), it only degrades this route."""
    try:
        from hermes_cli.web_server_sessions import _session_db_path_for_profile

        return Path(_session_db_path_for_profile(profile))
    except Exception:
        return get_hermes_home() / "state.db"


def _open_series_db(path: Path):
    """Open the store read-only, always.

    Deliberately not ``_open_session_db_for_profile``: its open path heals a
    missing/broken schema (and bootstraps a zero-byte store), i.e. a read route
    could write to the user's database. A raw ``f"file:{path}?mode=ro"`` URI is
    equally wrong — it truncates at a '?'/'#' in the home path and opens the
    wrong (empty) store, hence ``as_uri()`` (which percent-encodes) and the
    core's own helper when it is importable.
    """
    try:
        from hermes_state_holders import read_only_db_uri

        uri = read_only_db_uri(path)
    except Exception:
        uri = Path(path).resolve().as_uri() + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True)  # never writable: no heal, no bootstrap
    conn.row_factory = sqlite3.Row
    return conn


def _series_rows(profile: str | None, cutoff: float) -> List[sqlite3.Row]:
    """Run the aggregate, retrying once (a busy store / transient disk I/O
    error is worth one more try, the core does the same for reads). Every
    failure ends as a 503 the client renders as its usual ``unavailable``
    state — never as a partial or writable path."""
    last: Exception | None = None
    for attempt in (0, 1):
        conn = None
        try:
            path = _series_db_path(profile)
            if not path.exists():
                raise FileNotFoundError(str(path))
            conn = _open_series_db(path)
            return conn.execute(_SERIES_SQL, {"cutoff": float(cutoff)}).fetchall()
        except Exception as exc:
            last = exc
            if attempt == 0:
                time.sleep(0.05)
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass
    raise HTTPException(status_code=503, detail="series store unavailable") from last


def _series_slots(cutoff: float, now: float) -> List[str]:
    """Every local calendar day the window touches, in order.

    The window is ``cutoff..now``, so a 7-day request usually spans 8 calendar
    days and a 1-day request 2 — the core's daily buckets cover exactly this
    span. The axis must therefore be this day set (enumerated, zero-filled on
    the client): padding or truncating it to ``days`` slots would shift every
    column off its date.
    """
    slots: List[str] = []
    day = date.fromtimestamp(cutoff)
    last = date.fromtimestamp(now)
    while day <= last:
        slots.append(day.isoformat())
        day += timedelta(days=1)
    return slots


def _series_payload(
    profile: str | None, span: int, group: str, cutoff: float, now: float
) -> Dict[str, Any]:
    """Long-format payload: the day axis, the raw (day, model, provider) rows
    and the window total. Ranking (top 6 + 其他) happens in the widget's pure
    functions, so it is unit-testable and the route stays a plain aggregate."""
    slots = _series_slots(cutoff, now)
    on_axis = set(slots)
    rows: List[Dict[str, Any]] = []
    for row in _series_rows(profile, cutoff):
        day = row["day"]
        if day not in on_axis:  # same cutoff, but never emit an off-axis day
            continue
        rows.append({
            "day": day,
            "model": row["model"] or "",
            "provider": row["provider"] or "",
            "tokens": int(row["tok"] or 0),
        })
    return {
        "group": group,
        "period_days": span,
        "days": slots,
        "rows": rows,
        "totals": {"total_tokens": sum(r["tokens"] for r in rows)},
    }


@router.get("/analytics/series")
async def get_desktop_analytics_series(
    days: int = 7,
    group: str = "model",
    profile: str | None = None,
) -> Dict[str, Any]:
    """Per-day token usage split by model or by provider (main usage only)."""
    if group not in ("model", "provider"):
        raise HTTPException(status_code=400, detail="group must be 'model' or 'provider'")
    span = max(1, min(365, days))
    now = time.time()
    return await asyncio.to_thread(
        _series_payload, profile, span, group, now - span * 86400, now
    )


@router.get("/cron")
async def get_desktop_cron(profile: str = "all") -> list[Dict[str, Any]]:
    from hermes_cli.web_routers.cron import list_cron_jobs

    return await list_cron_jobs(profile=profile or "all")


@router.get("/sessions")
async def get_desktop_sessions(
    limit: int = 20,
    offset: int = 0,
    profile: str | None = None,
) -> Dict[str, Any]:
    from hermes_cli.web_routers.sessions import get_sessions

    return await asyncio.to_thread(
        get_sessions,
        limit=max(1, min(100, limit)),
        offset=max(0, offset),
        order="recent",
        profile=profile,
    )
