from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.permissions import ROLE_USER, set_user_role
from apps.agentic.models import CaseAnalysisJob
from apps.agentic.services.playbooks import create_pending_playbook_run
from apps.cases.models import Case, CaseSeverity, CaseStatus, CaseVerdict
from apps.playbooks.models import PlaybookJobStatus


class AgentSIEMValidationTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="agent", password="password")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_keyword_search_backend_value_error_returns_generic_bad_request(self):
        payload = {
            "keyword": "powershell",
            "index_name": 'main" | delete index=* | search index="x',
            "time_range_start": "2026-06-23T12:00:00Z",
            "time_range_end": "2026-06-23T13:00:00Z",
        }
        internal_detail = "Traceback in /opt/asp/custom/secrets.py: Invalid Splunk index name"

        with patch("apps.agent_api.views.siem_service.keyword_search", side_effect=ValueError(internal_detail)):
            response = self.client.post("/api/agent/v1/siem/search/keyword/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Invalid SIEM request.")
        self.assertNotIn("Traceback", str(response.data))
        self.assertNotIn("/opt/asp/custom", str(response.data))


class AgentApiDecisionAndMonitorTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_superuser(username="cli_admin", password="password", email="c@d.com")
        self.analyst = user_model.objects.create_user(username="cli_analyst", password="password")
        set_user_role(self.analyst, ROLE_USER)
        self.case = Case.objects.create(
            title="CLI decision test case",
            verdict_ai=CaseVerdict.TRUE_POSITIVE,
            severity_ai=CaseSeverity.HIGH,
        )

    def test_should_trigger_analyze_read_report_and_decide_via_agent_api(self):
        client = APIClient()
        client.force_authenticate(self.analyst)

        analyze_resp = client.post(f"/api/agent/v1/cases/{self.case.case_id}/analyze/")
        self.assertEqual(analyze_resp.status_code, 202)
        self.assertTrue(CaseAnalysisJob.objects.filter(case=self.case).exists())

        report_resp = client.get(f"/api/agent/v1/cases/{self.case.case_id}/report/")
        self.assertEqual(report_resp.status_code, 200)
        self.assertEqual(report_resp.data["data"]["case_id"], self.case.case_id)

        decide_resp = client.post(
            f"/api/agent/v1/cases/{self.case.case_id}/decide/",
            {"accept_ai": True, "status": CaseStatus.IN_PROGRESS, "decision_note": "Triaged from CLI"},
            format="json",
        )
        self.assertEqual(decide_resp.status_code, 200)
        self.case.refresh_from_db()
        self.assertEqual(self.case.verdict, CaseVerdict.TRUE_POSITIVE)
        self.assertEqual(self.case.severity, CaseSeverity.HIGH)
        self.assertEqual(self.case.status, CaseStatus.IN_PROGRESS)

    def test_should_approve_playbook_and_enforce_admin_on_agent_monitor(self):
        run = create_pending_playbook_run(
            name="Investigation",
            case=self.case,
            user=self.analyst,
            require_approval=True,
        )
        client = APIClient()
        client.force_authenticate(self.analyst)

        approve_resp = client.post(
            f"/api/agent/v1/playbooks/{run.playbook_id}/approve/",
            {"note": "Approved via CLI"},
            format="json",
        )
        self.assertEqual(approve_resp.status_code, 200)
        run.refresh_from_db()
        self.assertEqual(run.job_status, PlaybookJobStatus.PENDING)

        self.assertEqual(client.get("/api/agent/v1/agent/jobs/").status_code, 403)
        client.force_authenticate(self.admin)
        with patch("apps.agentic.services.agent_monitor.get_worker_health_states", return_value=[]):
            overview_resp = client.get("/api/agent/v1/agent/overview/")
        self.assertEqual(overview_resp.status_code, 200)
        self.assertIn("queue", overview_resp.data["data"])
