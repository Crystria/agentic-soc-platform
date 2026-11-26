from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from apps.accounts.permissions import ROLE_USER, set_user_role
from apps.agentic.analysis.prompts import (
    INVESTIGATION_SYSTEM_PROMPT,
    invoke_structured_llm_with_telemetry,
    list_prompt_catalog,
)
from apps.agentic.analysis.schemas import KnowledgeSearchKeywords
from apps.agentic.models import AgenticJobStatus, CaseAnalysisJob
from apps.agentic.services.cases import cancel_case_analysis_job, complete_case_analysis_job, start_case_analysis_job
from apps.cases.models import Case


class FakeStructuredChain:
    def __init__(self, result):
        self.result = result

    def invoke(self, messages):
        return self.result


class FakeLLMModel:
    def __init__(self, response):
        self.response = response

    def with_structured_output(self, schema, include_raw=False):
        if include_raw:
            return FakeStructuredChain({"raw": self.response, "parsed": KnowledgeSearchKeywords(keywords=["ssh", "brute-force"]), "parsing_error": None})
        return FakeStructuredChain(KnowledgeSearchKeywords(keywords=["ssh"]))


class FakeLLMAPI:
    def __init__(self, response):
        self.response = response

    def resolve_config_metadata(self, tag=None):
        return {"provider_name": "primary-openai", "model_name": "gpt-4o"}

    def get_model(self, tag=None):
        return FakeLLMModel(self.response)


class PromptTelemetryTests(SimpleTestCase):
    def test_should_capture_token_usage_and_provider_metadata(self):
        fake_raw = SimpleNamespace(usage_metadata={"input_tokens": 120, "output_tokens": 45, "total_tokens": 165})
        with patch("apps.agentic.analysis.prompts.LLMAPI", return_value=FakeLLMAPI(fake_raw)), patch(
            "apps.agentic.analysis.prompts.read_prompt", return_value="System prompt"
        ):
            parsed, telemetry = invoke_structured_llm_with_telemetry(
                prompt_id=INVESTIGATION_SYSTEM_PROMPT,
                payload={"case": {}},
                output_schema=KnowledgeSearchKeywords,
            )

        self.assertEqual(parsed.keywords, ["ssh", "brute-force"])
        self.assertEqual(telemetry["provider_name"], "primary-openai")
        self.assertEqual(telemetry["model_name"], "gpt-4o")
        self.assertEqual(telemetry["input_tokens"], 120)
        self.assertEqual(telemetry["output_tokens"], 45)
        self.assertEqual(telemetry["total_tokens"], 165)
        self.assertIn("latency_ms", telemetry)

    def test_should_list_builtin_prompts_for_inspector(self):
        prompts = list_prompt_catalog(language="en")
        prompt_ids = {item["prompt_id"] for item in prompts}
        self.assertIn(INVESTIGATION_SYSTEM_PROMPT, prompt_ids)


class AgentMonitorApiTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_superuser(username="monitor_admin", password="password", email="a@b.com")
        self.analyst = user_model.objects.create_user(username="monitor_user", password="password")
        set_user_role(self.analyst, ROLE_USER)
        self.case = Case.objects.create(title="SSH brute force case")

    def test_should_restrict_agent_monitor_to_admin(self):
        client = APIClient()
        client.force_authenticate(self.analyst)
        self.assertEqual(client.get("/api/agentic/overview/").status_code, 403)
        self.assertEqual(client.get("/api/agentic/jobs/").status_code, 403)
        self.assertEqual(client.get("/api/agentic/prompts/").status_code, 403)

    def test_should_trigger_cancel_and_retry_jobs_and_persist_telemetry(self):
        client = APIClient()
        client.force_authenticate(self.admin)

        trigger_resp = client.post("/api/agentic/jobs/trigger/", {"case_id": self.case.case_id}, format="json")
        self.assertEqual(trigger_resp.status_code, 202)
        job_id = trigger_resp.data["id"]

        cancel_resp = client.post(f"/api/agentic/jobs/{job_id}/cancel/")
        self.assertEqual(cancel_resp.status_code, 200)
        self.assertEqual(cancel_resp.data["status"], AgenticJobStatus.FAILED)

        retry_resp = client.post(f"/api/agentic/jobs/{job_id}/retry/")
        self.assertEqual(retry_resp.status_code, 202)
        retried_job = CaseAnalysisJob.objects.get(pk=retry_resp.data["id"])
        running = start_case_analysis_job(retried_job)
        completed = complete_case_analysis_job(
            running,
            result_json={"knowledge_keywords": ["ssh"], "report": {"verdict": "True Positive", "confidence": "High"}},
            telemetry={
                "provider_name": "primary-openai",
                "model_name": "gpt-4o",
                "prompt_version": "2026-06-20",
                "latency_ms": 842,
                "input_tokens": 500,
                "output_tokens": 120,
                "total_tokens": 620,
                "knowledge_keywords_count": 1,
                "knowledge_records_count": 2,
            },
        )
        self.assertEqual(completed.latency_ms, 842)
        self.assertEqual(completed.total_tokens, 620)

        with patch("apps.agentic.services.agent_monitor.get_worker_health_states", return_value=[]):
            overview_resp = client.get("/api/agentic/overview/")
        self.assertEqual(overview_resp.status_code, 200)
        self.assertEqual(overview_resp.data["queue"]["last_24h"]["total_tokens"], 620)
        self.assertEqual(overview_resp.data["rag"]["top_keywords"][0]["keyword"], "ssh")
        self.assertIn(overview_resp.data["rag"]["mode"], {"hybrid", "lexical"})
        self.assertIn("indexed_knowledge", overview_resp.data["rag"])

        with self.assertRaises(ValueError):
            cancel_case_analysis_job(completed)
