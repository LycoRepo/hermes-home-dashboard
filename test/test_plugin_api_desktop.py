import importlib
import sqlite3
import sys
import tempfile
import types
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from dashboard import plugin_api


class DesktopDataApiTest(unittest.IsolatedAsyncioTestCase):
    async def test_desktop_data_routes_delegate_to_current_hermes_services(self):
        async def system():
            return {"hostname": "personal-computer"}

        async def analytics(days=30, profile=None):
            return {"period_days": days, "profile": profile}

        async def cron(profile="all"):
            return [{"id": "daily", "profile": profile}]

        def sessions(**kwargs):
            return {"sessions": [], **kwargs}

        fakes = {
            "hermes_cli.web_routers.status": types.SimpleNamespace(get_system_stats=system),
            "hermes_cli.web_routers.analytics": types.SimpleNamespace(get_usage_analytics=analytics),
            "hermes_cli.web_routers.cron": types.SimpleNamespace(list_cron_jobs=cron),
            "hermes_cli.web_routers.sessions": types.SimpleNamespace(get_sessions=sessions),
        }

        with patch.dict(sys.modules, fakes):
            self.assertEqual(await plugin_api.get_desktop_system(), {"hostname": "personal-computer"})
            self.assertEqual(
                await plugin_api.get_desktop_analytics(days=7, profile="default"),
                {"period_days": 7, "profile": "default"},
            )
            self.assertEqual(
                await plugin_api.get_desktop_cron(profile="default"),
                [{"id": "daily", "profile": "default"}],
            )
            self.assertEqual(
                await plugin_api.get_desktop_sessions(limit=9, offset=3, profile="default"),
                {
                    "sessions": [],
                    "limit": 9,
                    "offset": 3,
                    "order": "recent",
                    "profile": "default",
                },
            )


class DesktopModelsAnalyticsTest(unittest.IsolatedAsyncioTestCase):
    """The grouped Tokens view reads the core models source through the plugin."""

    def setUp(self):
        async def models(days=30, profile=None):
            return {"models": [], "period_days": days, "profile": profile}

        self.fakes = {
            "hermes_cli.web_routers.analytics": types.SimpleNamespace(
                get_models_analytics=models
            ),
        }

    async def test_models_route_delegates_to_current_hermes_service(self):
        with patch.dict(sys.modules, self.fakes):
            self.assertEqual(
                await plugin_api.get_desktop_models_analytics(days=7, profile="default"),
                {"models": [], "period_days": 7, "profile": "default"},
            )

    async def test_models_route_clamps_days(self):
        with patch.dict(sys.modules, self.fakes):
            self.assertEqual(
                (await plugin_api.get_desktop_models_analytics(days=99999))["period_days"],
                365,
            )
            self.assertEqual(
                (await plugin_api.get_desktop_models_analytics(days=0))["period_days"],
                1,
            )


def _make_store(path, rows=(), tables=True):
    """A throwaway state.db with just the columns the series aggregate reads."""
    conn = sqlite3.connect(path)
    if tables:
        conn.executescript(
            """
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY, started_at REAL,
                input_tokens INTEGER, output_tokens INTEGER);
            CREATE TABLE session_model_usage (
                session_id TEXT, model TEXT, billing_provider TEXT, task TEXT,
                input_tokens INTEGER, output_tokens INTEGER);
            """
        )
        for row in rows:
            conn.execute(
                "INSERT INTO sessions (id, started_at) VALUES (?, ?)",
                (row["sid"], row["ts"]),
            )
            conn.execute(
                "INSERT INTO session_model_usage "
                "(session_id, model, billing_provider, task, input_tokens, output_tokens) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (row["sid"], row["model"], row["provider"], row.get("task", ""),
                 row["input"], row["output"]),
            )
    conn.commit()
    conn.close()


class DesktopAnalyticsSeriesTest(unittest.IsolatedAsyncioTestCase):
    """The grouped Tokens views read a per-day × model/provider series the
    plugin aggregates itself (the core has no such endpoint). It must stay on
    the same ruler as the day view: same window, same local calendar day, main
    usage only, and a strictly read-only store handle."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.db = Path(tmp.name) / "state.db"

    async def _series(self, **kwargs):
        with patch.object(plugin_api, "_series_db_path", lambda profile: self.db):
            return await plugin_api.get_desktop_analytics_series(**kwargs)

    def _seed_two_local_days(self):
        """Local 00:30 yesterday — early enough that its UTC day differs on any
        positive-offset machine, which is what the 'localtime' clause is for."""
        local = datetime.now().replace(hour=0, minute=30, second=0, microsecond=0)
        seeded = local - timedelta(days=1)
        _make_store(self.db, [
            {"sid": "s1", "ts": seeded.timestamp(), "model": "qwen3-flash",
             "provider": "alibaba-cn", "input": 100, "output": 20},
            {"sid": "s2", "ts": seeded.timestamp() + 3600, "model": "qwen3-flash",
             "provider": "alibaba", "input": 5, "output": 5},
            {"sid": "s3", "ts": seeded.timestamp(), "model": "vision-pro",
             "provider": "mira", "input": 999, "output": 999, "task": "vision"},
        ])
        return seeded

    async def test_series_route_returns_axis_rows_and_totals(self):
        seeded = self._seed_two_local_days()
        out = await self._series(days=2, group="model")

        self.assertEqual(out["group"], "model")
        self.assertEqual(out["period_days"], 2)
        self.assertEqual(set(out), {"group", "period_days", "days", "rows", "totals"})
        # The axis is the enumerated local day set the window touches (days + 1
        # for a mid-day run) — never padded or truncated to `days` slots.
        self.assertEqual(out["days"][-1], date.fromtimestamp(seeded.timestamp() + 86400).isoformat())
        self.assertEqual(len(out["days"]), 3)
        self.assertEqual(
            out["days"],
            [(date.fromtimestamp(seeded.timestamp() + 86400) - timedelta(days=n)).isoformat()
             for n in (2, 1, 0)],
        )

        local_day = date.fromtimestamp(seeded.timestamp()).isoformat()
        # Local calendar day (not UTC), and the auxiliary (task='vision') row is
        # excluded: including it would put the grouped view on another ruler.
        self.assertEqual({r["day"] for r in out["rows"]}, {local_day})
        utc_day = datetime.fromtimestamp(seeded.timestamp(), tz=timezone.utc).date().isoformat()
        if utc_day != local_day:
            self.assertNotIn(utc_day, {r["day"] for r in out["rows"]})
        self.assertEqual(
            sorted((r["model"], r["provider"], r["tokens"]) for r in out["rows"]),
            [("qwen3-flash", "alibaba", 10), ("qwen3-flash", "alibaba-cn", 120)],
        )
        self.assertEqual(out["totals"]["total_tokens"], 130)

    async def test_series_route_groups_by_provider_and_keeps_every_day(self):
        seeded = self._seed_two_local_days()
        out = await self._series(days=2, group="provider")
        self.assertEqual(out["group"], "provider")
        # Rows carry the raw billing_provider; merging spellings is the widget's
        # pure `providerLabel` job, so both Alibaba spellings arrive separately.
        self.assertEqual(
            sorted((r["provider"], r["tokens"]) for r in out["rows"]),
            [("alibaba", 10), ("alibaba-cn", 120)],
        )
        # A day with no usage is simply absent from rows; the axis still lists it.
        empty_day = (date.fromtimestamp(seeded.timestamp()) - timedelta(days=1)).isoformat()
        self.assertIn(empty_day, out["days"])
        self.assertNotIn(empty_day, {r["day"] for r in out["rows"]})

    async def test_series_route_axis_spans_the_same_window_as_the_core(self):
        """days=1 covers two local days (cutoff = now - 86400), which is what the
        core's daily buckets cover too — the axis is the day set, not `days`."""
        _make_store(self.db, [])
        before = datetime.now()
        out = await self._series(days=1, group="model")
        after = datetime.now()
        self.assertEqual(
            out["days"],
            [date.fromtimestamp(before.timestamp() - 86400).isoformat(),
             date.fromtimestamp(after.timestamp()).isoformat()],
        )

    async def test_series_route_clamps_days(self):
        _make_store(self.db, [])
        self.assertEqual((await self._series(days=99999, group="model"))["period_days"], 365)
        self.assertEqual((await self._series(days=0, group="model"))["period_days"], 1)
        self.assertEqual((await self._series(days=1, group="model"))["period_days"], 1)

    async def test_series_route_rejects_an_unknown_group(self):
        with self.assertRaises(plugin_api.HTTPException) as caught:
            await self._series(days=7, group="day")
        self.assertEqual(caught.exception.status_code, 400)

    async def test_series_route_degrades_to_503_without_a_store(self):
        with self.assertRaises(plugin_api.HTTPException) as caught:
            await self._series(days=7, group="model")
        self.assertEqual(caught.exception.status_code, 503)

    async def test_series_route_degrades_to_503_on_a_missing_table(self):
        _make_store(self.db, [], tables=False)
        with self.assertRaises(plugin_api.HTTPException) as caught:
            await self._series(days=7, group="model")
        self.assertEqual(caught.exception.status_code, 503)

    def test_series_connection_is_read_only(self):
        """The route must never open a writable handle: the core's open path
        heals a broken schema, which would rewrite the user's store from a
        read. With the optional core helper absent it falls back to as_uri()."""
        _make_store(self.db, [])
        with patch.dict(sys.modules, {"hermes_state_holders": None}):
            conn = plugin_api._open_series_db(self.db)
        try:
            with self.assertRaises(sqlite3.OperationalError):
                conn.execute("CREATE TABLE nope (x INTEGER)")
        finally:
            conn.close()

    async def test_series_route_survives_the_optional_core_helpers_being_absent(self):
        """1.4.0 shipped a plugin backend that failed to load because a core
        import disappeared. Everything core-side is imported inside the call
        and guarded, so the route still answers (or degrades to 503)."""
        self._seed_two_local_days()
        fakes = {
            "hermes_state_holders": None,
            "hermes_cli": None,
            "hermes_cli.web_server_sessions": None,
        }
        with patch.dict(sys.modules, fakes):
            out = await self._series(days=7, group="model")
        self.assertEqual(out["totals"]["total_tokens"], 130)

    async def test_module_import_never_needs_the_core(self):
        fakes = {
            "hermes_constants": None,
            "hermes_state_holders": None,
            "hermes_cli": None,
            "hermes_cli.web_server_sessions": None,
        }
        with patch.dict(sys.modules, fakes):
            module = importlib.reload(plugin_api)
            self.assertTrue(callable(module.get_desktop_analytics_series))
        importlib.reload(plugin_api)  # leave the module as the other tests expect it


if __name__ == "__main__":
    unittest.main()
