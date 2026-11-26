from io import StringIO
import os
from unittest.mock import patch

from django.core.management import call_command
from django.test import SimpleTestCase, TestCase

from apps.settings.env_sync import collect_env_llm_specs, sync_llm_providers_from_env
from apps.settings.models import LLMProviderConfig, ThreatIntelOpenCTIConfig
from apps.settings.runtime_config import get_llm_configs, invalidate
from apps.settings.serializers import ThreatIntelOpenCTIConfigSerializer
from apps.settings.services import test_alienvault_otx_config, test_opencti_config

import httpx


class FakeHelper:
    def __init__(self, items):
        self.items = items

    def list(self, **kwargs):
        return self.items


class FakeOpenCTIClient:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        self.indicator = FakeHelper([{"id": "indicator-1", "name": "Indicator sample", "entity_type": "Indicator"}])
        self.stix_cyber_observable = FakeHelper(
            [{"id": "observable-1", "observable_value": "203.0.113.10", "entity_type": "IPv4-Addr"}]
        )


class FakeOTXClientWithPublicIndicatorEndpoint:
    requested_urls = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def get(self, url, headers):
        self.requested_urls.append(url)
        if url.endswith("/user/me"):
            return httpx.Response(403, json={"detail": "Authentication required"})
        return httpx.Response(200, json={"indicator": "8.8.8.8", "pulse_info": {"count": 0}})


class ThreatIntelAlienVaultOTXServiceTests(SimpleTestCase):
    @patch("apps.settings.services.httpx.Client", FakeOTXClientWithPublicIndicatorEndpoint)
    def test_otx_test_uses_authenticated_endpoint(self):
        FakeOTXClientWithPublicIndicatorEndpoint.requested_urls = []

        result = test_alienvault_otx_config(
            {
                "api_key": "wrong-key",
                "base_url": "https://otx.alienvault.com/api/v1",
                "proxy": "",
            }
        )

        self.assertFalse(result["success"])
        self.assertEqual(FakeOTXClientWithPublicIndicatorEndpoint.requested_urls, ["https://otx.alienvault.com/api/v1/user/me"])


class ThreatIntelOpenCTIConfigSerializerTests(SimpleTestCase):
    def test_token_is_hidden_without_reveal_context(self):
        instance = ThreatIntelOpenCTIConfig(url="http://opencti.example", token="secret-token")

        data = ThreatIntelOpenCTIConfigSerializer(instance).data

        self.assertEqual(data["token"], "")
        self.assertTrue(data["token_configured"])

    def test_token_can_be_revealed_with_context(self):
        instance = ThreatIntelOpenCTIConfig(url="http://opencti.example", token="secret-token")

        data = ThreatIntelOpenCTIConfigSerializer(instance, context={"reveal_secrets": True}).data

        self.assertEqual(data["token"], "secret-token")


class ThreatIntelOpenCTIServiceTests(SimpleTestCase):
    @patch("apps.settings.services.OpenCTIApiClient", FakeOpenCTIClient)
    def test_opencti_test_checks_health_and_read_permission(self):
        result = test_opencti_config(
            {
                "url": "http://opencti.example",
                "token": "secret-token",
                "ssl_verify": False,
                "proxy": "",
            }
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["detail"], "OpenCTI responded successfully.")
        self.assertIn("indicator_sample_count", result["response_preview"])
        self.assertIn("observable_sample_count", result["response_preview"])

    def test_opencti_test_requires_token(self):
        result = test_opencti_config(
            {
                "url": "http://opencti.example",
                "token": "",
                "ssl_verify": False,
                "proxy": "",
            }
        )

        self.assertFalse(result["success"])
        self.assertEqual(result["detail"], "OpenCTI API token is not configured.")


class EnvLLMProviderSyncTests(TestCase):
    def setUp(self):
        invalidate("llm")

    def tearDown(self):
        invalidate("llm")

    def test_should_collect_gemini_defaults_and_multiple_models_from_env(self):
        specs = collect_env_llm_specs(
            {
                "GEMINI_API_KEY": "test-gemini-key",
                "GEMINI_MODELS": "gemini-2.5-flash,gemini-2.5-pro",
                "GEMINI_TAGS": "structured_output,fast",
            }
        )

        self.assertEqual(len(specs), 2)
        self.assertEqual(specs[0]["name"], "env:gemini")
        self.assertEqual(specs[0]["base_url"], "https://generativelanguage.googleapis.com/v1beta/openai")
        self.assertEqual(specs[0]["model"], "gemini-2.5-flash")
        self.assertEqual(specs[0]["tags"], ["structured_output", "fast"])
        self.assertEqual(specs[0]["priority"], 50)
        self.assertEqual(specs[1]["name"], "env:gemini:2")
        self.assertEqual(specs[1]["model"], "gemini-2.5-pro")
        self.assertEqual(specs[1]["priority"], 51)

    def test_should_upsert_providers_idempotently_and_never_leak_api_key(self):
        env = {"API_KEY_GEMINI": "secret-google-key-value", "GEMINI_MODEL": "gemini-2.5-flash"}
        first = sync_llm_providers_from_env(environ=env)
        second = sync_llm_providers_from_env(environ=env)

        self.assertEqual(first[0]["action"], "created")
        self.assertEqual(second[0]["action"], "unchanged")
        self.assertNotIn("api_key", first[0])

        provider = LLMProviderConfig.objects.get(name="env:gemini")
        self.assertEqual(provider.model, "gemini-2.5-flash")
        self.assertEqual(provider.api_key, "secret-google-key-value")

        updated = sync_llm_providers_from_env(
            environ={"API_KEY_GEMINI": "secret-google-key-value", "GEMINI_MODEL": "gemini-2.5-pro"}
        )
        self.assertEqual(updated[0]["action"], "updated")
        provider.refresh_from_db()
        self.assertEqual(provider.model, "gemini-2.5-pro")

    def test_should_fallback_to_env_when_db_has_no_enabled_providers(self):
        LLMProviderConfig.objects.all().delete()
        invalidate("llm")
        with patch.dict(os.environ, {"GEMINI_API_KEY": "fallback-key"}, clear=True):
            configs = get_llm_configs()

        self.assertTrue(
            any(
                item["name"] == "env:gemini"
                and item["model"] == "gemini-flash-latest"
                and item["api_key"] == "fallback-key"
                for item in configs
            )
        )

    def test_should_run_sync_command_without_printing_secrets(self):
        out = StringIO()
        secret_value = "AIzaSy-DO-NOT-PRINT-ME"
        with patch.dict(os.environ, {"GEMINI_API_KEY": secret_value}, clear=True):
            with patch("apps.settings.management.commands.sync_llm_providers.load_project_dotenv_files"):
                call_command("sync_llm_providers", stdout=out)

        output = out.getvalue()
        self.assertIn("env:gemini", output)
        self.assertNotIn(secret_value, output)
