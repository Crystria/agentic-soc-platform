from datetime import timedelta
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from django.urls import Resolver404, resolve
from django.utils import timezone
from rest_framework.test import APIClient

from apps.settings.models import RuntimeConfig, SiemElkConfig
from apps.settings.runtime_config import get_elk_config, invalidate
from apps.webhook.elk_actions import ELKActionProcessor
from apps.webhook.schemas import WebhookResult
from apps.webhook.service import (
    WebhookRedisError,
    handle_kibana_webhook,
    handle_splunk_webhook,
    handle_wazuh_webhook,
    ingest_elastic_security_alert,
)


class FakeRedisClient:
    def __init__(self):
        self.messages = []

    def send_message(self, stream, data, *, maxlen=None):
        self.messages.append({"stream": stream, "data": data, "maxlen": maxlen})
        return f"{len(self.messages)}-0"


class FailingRedisClient:
    def send_message(self, stream, data, *, maxlen=None):
        raise RuntimeError("redis unavailable")


class FakeElkClient:
    def __init__(self):
        self.searches = []

    def search(self, **kwargs):
        self.searches.append(kwargs)
        return {
            "hits": {
                "hits": [
                    {
                        "_source": {
                            "rule": {"name": "rule-without-hits"},
                            "context": {"hits": []},
                        }
                    }
                ]
            }
        }


class WebhookServiceTests(TestCase):
    def set_stream_maxlen(self, value):
        config = RuntimeConfig.get_current()
        config.stream_maxlen = value
        config.save(update_fields=["stream_maxlen", "updated_at"])
        invalidate("runtime")

    def test_handle_splunk_webhook_writes_result_to_search_stream(self):
        self.set_stream_maxlen(123)
        redis_client = FakeRedisClient()

        result = handle_splunk_webhook(
            {"search_name": " test-search ", "result": {"host": "server-1"}},
            redis_client=redis_client,
        )

        self.assertEqual(result.stream, "test-search")
        self.assertEqual(result.sent, 1)
        self.assertEqual(result.skipped, 0)
        self.assertEqual(result.message_ids, ["1-0"])
        self.assertEqual(
            redis_client.messages,
            [{"stream": "test-search", "data": {"host": "server-1"}, "maxlen": 123}],
        )

    def test_handle_splunk_webhook_rejects_empty_search_name(self):
        with self.assertRaisesMessage(ValueError, "search_name is required."):
            handle_splunk_webhook({"search_name": " ", "result": {}}, redis_client=FakeRedisClient())

    def test_handle_kibana_webhook_writes_normalized_sources(self):
        self.set_stream_maxlen(456)
        redis_client = FakeRedisClient()

        result = handle_kibana_webhook(
            {
                "rule": {"name": " kibana-rule "},
                "context": {
                    "hits": [
                        {
                            "_source": {
                                "user": {"keyword": "alice"},
                                "host.keyword": "ignored",
                                "tags": [{"keyword": "prod"}],
                            }
                        }
                    ]
                },
            },
            redis_client=redis_client,
        )

        self.assertEqual(result.stream, "kibana-rule")
        self.assertEqual(result.sent, 1)
        self.assertEqual(result.skipped, 0)
        self.assertEqual(result.message_ids, ["1-0"])
        self.assertEqual(
            redis_client.messages,
            [{"stream": "kibana-rule", "data": {"user": "alice", "tags": ["prod"]}, "maxlen": 456}],
        )

    def test_handle_wazuh_webhook_writes_to_wazuh_stream(self):
        self.set_stream_maxlen(789)
        redis_client = FakeRedisClient()

        payload = {
            "timestamp": "2026-11-11T12:00:00.000+0000",
            "rule": {"id": "5710", "level": 10, "description": "sshd: brute force"},
            "agent": {"name": "ubuntu-lab", "ip": "192.168.1.50"},
            "data": {"srcip": "10.0.0.99", "dstuser": "root"},
        }

        result = handle_wazuh_webhook(payload, redis_client=redis_client)

        self.assertEqual(result.stream, "WAZUH-ALERTS")
        self.assertEqual(result.sent, 1)
        self.assertEqual(result.skipped, 0)
        self.assertEqual(result.message_ids, ["1-0"])
        self.assertEqual(redis_client.messages[0]["stream"], "WAZUH-ALERTS")
        self.assertEqual(redis_client.messages[0]["data"]["rule"]["id"], "5710")

    def test_handle_wazuh_webhook_direct_ingest_creates_case_alert_artifacts_and_job(self):
        from apps.agentic.models import CaseAnalysisJob
        from apps.alerts.models import Alert, AlertPolicyType
        from apps.cases.models import Case

        payload = {
            "timestamp": "2026-11-11T05:01:45.000+0000",
            "rule": {
                "level": 14,
                "description": "Shadow copy deletion using vssadmin.exe detected",
                "id": "92015",
                "groups": ["windows", "sysmon", "ransomware"],
                "mitre": {
                    "id": ["T1490"],
                    "tactic": ["Impact"],
                    "technique": ["Inhibit System Recovery"],
                },
            },
            "agent": {"id": "003", "name": "win-fileserver01", "ip": "10.0.1.5"},
            "data": {
                "win": {
                    "eventdata": {
                        "image": "C:\\Windows\\System32\\vssadmin.exe",
                        "commandLine": "vssadmin.exe delete shadows /all /quiet",
                        "targetUserName": "SYSTEM",
                    }
                }
            },
            "full_log": "Sysmon Event 1: vssadmin.exe executed.",
        }

        result = handle_wazuh_webhook(payload, redis_client=FakeRedisClient(), direct_ingest=True)

        self.assertEqual(result.stream, "WAZUH-ALERTS")
        self.assertEqual(result.sent, 1)
        self.assertEqual(Case.objects.count(), 1)
        self.assertEqual(Alert.objects.count(), 1)
        self.assertEqual(CaseAnalysisJob.objects.count(), 1)
        alert = Alert.objects.first()
        self.assertEqual(alert.policy_type, AlertPolicyType.OTHER)
        self.assertEqual(alert.tactic, "Impact")
        self.assertEqual(alert.artifacts.count(), 5)

    def test_handle_wazuh_webhook_direct_ingest_handles_missing_mitre_tactic(self):
        from apps.alerts.models import Alert

        payload = {
            "timestamp": "2026-11-11T12:00:00.000+0000",
            "rule": {"id": "5710", "level": 3, "description": "Minor event without MITRE"},
            "agent": {"name": "ubuntu-lab", "ip": "192.168.1.50"},
            "data": {},
        }

        result = handle_wazuh_webhook(payload, redis_client=FakeRedisClient(), direct_ingest=True)

        self.assertEqual(result.sent, 1)
        self.assertEqual(Alert.objects.first().tactic, "")

    def test_handle_kibana_webhook_skips_empty_sources(self):
        redis_client = FakeRedisClient()

        result = handle_kibana_webhook(
            {"rule": {"name": "rule"}, "context": {"hits": [{"_source": {}}, None]}},
            redis_client=redis_client,
        )

        self.assertEqual(result.sent, 0)
        self.assertEqual(result.skipped, 2)
        self.assertEqual(redis_client.messages, [])

    def test_handle_kibana_webhook_raises_webhook_error_on_redis_failure(self):
        with self.assertRaisesMessage(WebhookRedisError, "Failed to write Redis stream rule: RuntimeError"):
            handle_kibana_webhook(
                {"rule": {"name": "rule"}, "context": {"hits": [{"_source": {"event": "login"}}]}},
                redis_client=FailingRedisClient(),
            )


class ELKActionProcessorTests(TestCase):
    def test_process_once_refreshes_config_cached_before_settings_change(self):
        config = SiemElkConfig.get_current()
        config.host = "https://elk.example.com:9200"
        config.api_key = "test-api-key"
        config.process_alert_from_index_enabled = False
        config.save()
        invalidate("elk")

        elk_client = FakeElkClient()
        processor = ELKActionProcessor(elk_client=elk_client, interval_seconds=60)
        self.assertFalse(get_elk_config()["process_alert_from_index_enabled"])

        config.process_alert_from_index_enabled = True
        config.save(update_fields=["process_alert_from_index_enabled", "updated_at"])

        end_time = timezone.now()
        result = processor.process_once(start_time=end_time - timedelta(seconds=60), end_time=end_time)

        self.assertEqual(result.actions, 1)
        self.assertEqual(result.skipped, 1)
        self.assertEqual(len(elk_client.searches), 1)

    def test_process_action_forwards_elastic_security_alert_to_elastic_stream(self):
        fake_redis = FakeRedisClient()
        processor = ELKActionProcessor(elk_client=FakeElkClient(), interval_seconds=60)
        elastic_alert_doc = {
            "@timestamp": "2026-11-26T04:15:00Z",
            "kibana": {
                "alert": {
                    "rule": {"name": "Suspicious PowerShell Execution", "rule_id": "ps-001"},
                    "severity": "high",
                    "risk_score": 73,
                    "reason": "powershell.exe executed encoded command",
                }
            },
            "host": {"name": "WIN-WORKSTATION", "ip": ["192.168.1.25"]},
            "user": {"name": "analyst"},
        }

        with patch("apps.webhook.service.RedisStreamClient", return_value=fake_redis):
            sent, skipped = processor.process_action(elastic_alert_doc)

        self.assertEqual(sent, 1)
        self.assertEqual(skipped, 0)
        self.assertEqual(len(fake_redis.messages), 1)
        self.assertEqual(fake_redis.messages[0]["stream"], "ELASTIC-SECURITY-ALERTS")
        self.assertEqual(fake_redis.messages[0]["data"]["host"]["name"], "WIN-WORKSTATION")


class ElasticSecurityIngestTests(TestCase):
    def test_ingest_elastic_security_alert_creates_case_alert_artifacts_and_job(self):
        from apps.agentic.models import CaseAnalysisJob
        from apps.alerts.models import Alert
        from apps.cases.models import Case

        raw_alert = {
            "@timestamp": "2026-11-26T04:20:00Z",
            "event": {"module": "endpoint", "dataset": "endpoint.events.process"},
            "kibana": {
                "alert": {
                    "uuid": "elastic-alert-uuid-001",
                    "rule": {
                        "name": "Suspicious PowerShell Download Cradle",
                        "rule_id": "elastic-ps-cradle",
                        "tags": ["Windows", "Execution"],
                        "threat": [
                            {
                                "framework": "MITRE ATT&CK",
                                "tactic": {"name": "Execution"},
                                "technique": [{"id": "T1059.001", "name": "PowerShell"}],
                            }
                        ],
                    },
                    "severity": "high",
                    "risk_score": 78,
                    "reason": "powershell.exe spawned by cmd.exe with network download",
                }
            },
            "host": {"name": "WIN11-SOC", "ip": ["192.168.1.10"]},
            "user": {"name": "anhquan"},
            "source": {"ip": "203.0.113.45"},
            "process": {
                "name": "powershell.exe",
                "command_line": "powershell.exe -NoP -W Hidden -c IEX (...)",
                "parent": {"name": "cmd.exe"},
            },
            "file": {"path": "C:\\Temp\\stage.ps1", "hash": {"sha256": "abc123def456"}},
            "url": {"full": "https://malicious.example.invalid/stage.ps1"},
        }

        alert = ingest_elastic_security_alert(raw_alert, schedule_analysis=True)

        self.assertEqual(Case.objects.count(), 1)
        self.assertEqual(Alert.objects.count(), 1)
        self.assertEqual(CaseAnalysisJob.objects.count(), 1)
        self.assertEqual(alert.product_name, "Elastic Security")
        self.assertEqual(alert.severity, "High")
        self.assertEqual(alert.tactic, "Execution")
        self.assertEqual(alert.technique, "T1059.001 - PowerShell")
        self.assertGreaterEqual(alert.artifacts.count(), 8)

    def test_elastic_security_module_and_siem_yaml_registry_load(self):
        from custom.modules.elastic_security_alert import Module
        from integrations.siem.registry import reload_registry, scan_registry_configs

        module = Module()
        self.assertEqual(module.STREAM_NAME, "ELASTIC-SECURITY-ALERTS")

        reload_registry()
        indices, errors = scan_registry_configs()
        self.assertEqual(errors, [])
        by_name = {item["name"]: item for item in indices}
        self.assertIn("logs-*", by_name)
        self.assertIn(".alerts-security.alerts-*", by_name)
        self.assertEqual(by_name["logs-*"]["backend"], "ELK")
        self.assertEqual(by_name[".alerts-security.alerts-*"]["backend"], "ELK")


class WebhookAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()

    @patch("apps.webhook.views.handle_splunk_webhook")
    def test_splunk_webhook_route_uses_new_api_path(self, handle_splunk_webhook_mock):
        handle_splunk_webhook_mock.return_value = WebhookResult(stream="search", sent=1, message_ids=["1-0"])

        response = self.client.post(
            "/api/webhook/splunk/",
            {"search_name": "search", "result": {"host": "server-1"}},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["stream"], "search")
        handle_splunk_webhook_mock.assert_called_once()

    @patch("apps.webhook.views.handle_kibana_webhook")
    def test_kibana_webhook_route_uses_new_api_path(self, handle_kibana_webhook_mock):
        handle_kibana_webhook_mock.return_value = WebhookResult(stream="rule", sent=1, message_ids=["1-0"])

        response = self.client.post(
            "/api/webhook/kibana/",
            {"rule": {"name": "rule"}, "context": {"hits": [{"_source": {"host": "server-1"}}]}},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["stream"], "rule")
        handle_kibana_webhook_mock.assert_called_once()

    @patch("apps.webhook.views.handle_wazuh_webhook")
    def test_wazuh_webhook_route(self, handle_wazuh_webhook_mock):
        handle_wazuh_webhook_mock.return_value = WebhookResult(stream="WAZUH-ALERTS", sent=1, message_ids=["1-0"])

        response = self.client.post(
            "/api/webhook/wazuh/",
            {"rule": {"id": "5710", "description": "SSH Brute Force"}},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["stream"], "WAZUH-ALERTS")
        handle_wazuh_webhook_mock.assert_called_once()

    @patch("apps.webhook.views.handle_splunk_webhook")
    def test_webhook_redis_error_returns_service_unavailable(self, handle_splunk_webhook_mock):
        handle_splunk_webhook_mock.side_effect = WebhookRedisError("Failed to write Redis stream search: RuntimeError")

        response = self.client.post(
            "/api/webhook/splunk/",
            {"search_name": "search", "result": {"host": "server-1"}},
            format="json",
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "Webhook stream service is unavailable.")

    def test_old_agentic_forwarder_route_is_removed(self):
        with self.assertRaises(Resolver404):
            resolve("/api/agentic/forwarder/splunk/")
