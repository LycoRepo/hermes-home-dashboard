import sys
import types
import unittest
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


if __name__ == "__main__":
    unittest.main()
