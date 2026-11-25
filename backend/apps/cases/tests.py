import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.permissions import ROLE_USER, ROLE_VIEWER, set_user_role
from apps.agentic.models import AgenticJobStatus, CaseAnalysisJob
from apps.audit.models import AuditLog
from apps.cases.ai_quality import (
    compare_ordinal_field,
    compare_verdict,
    sync_case_ai_quality_evaluation,
)
from apps.cases.models import (
    AiQualityCoverageState,
    AiQualityDirection,
    AiQualityEvaluation,
    Case,
    CaseConfidence,
    CaseImpact,
    CasePriority,
    CaseSeverity,
    CaseStatus,
    CaseVerdict,
)
from apps.comments.models import Comment


class AiQualityComparisonHelperTests(SimpleTestCase):
    def test_should_compute_ordinal_overestimate_and_distance(self):
        result = compare_ordinal_field("severity", CaseSeverity.CRITICAL, CaseSeverity.MEDIUM)
        self.assertFalse(result["agrees"])
        self.assertEqual(result["distance"], 2)
        self.assertEqual(result["direction"], AiQualityDirection.OVERESTIMATE)

    def test_should_treat_unknown_as_exact_only_without_distance(self):
        result = compare_ordinal_field("confidence", CaseConfidence.UNKNOWN, CaseConfidence.HIGH)
        self.assertFalse(result["agrees"])
        self.assertIsNone(result["distance"])
        self.assertEqual(result["direction"], "")

        matched = compare_ordinal_field("confidence", CaseConfidence.UNKNOWN, CaseConfidence.UNKNOWN)
        self.assertTrue(matched["agrees"])
        self.assertIsNone(matched["distance"])

    def test_should_return_not_evaluable_when_either_side_empty(self):
        result = compare_verdict(CaseVerdict.TRUE_POSITIVE, "")
        self.assertIsNone(result["agrees"])


class AiDecisionAndQualityIntegrationTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_superuser(
            username="soc_admin",
            password="password",
            email="admin@example.com",
        )
        self.analyst = user_model.objects.create_user(
            username="soc_analyst",
            password="password",
        )
        set_user_role(self.analyst, ROLE_USER)
        self.viewer = user_model.objects.create_user(
            username="soc_viewer",
            password="password",
        )
        set_user_role(self.viewer, ROLE_VIEWER)

    def _create_case_with_ai(self):
        report_payload = {
            "report": {
                "verdict": CaseVerdict.TRUE_POSITIVE,
                "severity": CaseSeverity.HIGH,
                "impact": CaseImpact.HIGH,
                "priority": CasePriority.HIGH,
                "confidence": CaseConfidence.HIGH,
                "digest": "Confirmed credential access followed by lateral movement.",
            }
        }
        case = Case.objects.create(
            title="Credential dump alert",
            category="EDR",
            verdict_ai=CaseVerdict.TRUE_POSITIVE,
            severity_ai=CaseSeverity.HIGH,
            impact_ai=CaseImpact.HIGH,
            priority_ai=CasePriority.HIGH,
            confidence_ai=CaseConfidence.HIGH,
            investigation_report_ai_json=json.dumps(report_payload),
        )
        job = CaseAnalysisJob.objects.create(
            case=case,
            status=AgenticJobStatus.SUCCESS,
            completed_at=timezone.now() - timedelta(minutes=5),
            result_json=report_payload,
        )
        return case, job

    def test_should_apply_ai_assessment_and_record_decision_note(self):
        case, _job = self._create_case_with_ai()
        client = APIClient()
        client.force_authenticate(self.analyst)

        response = client.post(
            f"/api/cases/{case.id}/apply-ai-assessment/",
            {
                "fields": ["verdict", "severity"],
                "apply_digest_to_summary": True,
                "decision_note": "Confirmed against EDR process tree.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        case.refresh_from_db()
        self.assertEqual(case.verdict, CaseVerdict.TRUE_POSITIVE)
        self.assertEqual(case.severity, CaseSeverity.HIGH)
        self.assertEqual(case.summary, "Confirmed credential access followed by lateral movement.")
        self.assertTrue(Comment.objects.filter(object_id=str(case.pk), body__contains="[AI Decision]").exists())

    def test_should_forbid_viewer_from_applying_ai_assessment(self):
        case, _job = self._create_case_with_ai()
        client = APIClient()
        client.force_authenticate(self.viewer)

        response = client.post(f"/api/cases/{case.id}/apply-ai-assessment/", {}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_should_sync_evaluation_on_close_reopen_and_not_write_audit_logs(self):
        case, job = self._create_case_with_ai()
        closed_at = timezone.now()
        case.status = CaseStatus.CLOSED
        case.closed_time = closed_at
        case.verdict = CaseVerdict.TRUE_POSITIVE
        case.severity = CaseSeverity.MEDIUM
        case.save()

        audit_count_before = AuditLog.objects.count()
        evaluation = sync_case_ai_quality_evaluation(case.id)
        self.assertIsNotNone(evaluation)
        self.assertEqual(evaluation.coverage_state, AiQualityCoverageState.EVALUATED)
        self.assertEqual(evaluation.reference_job_id, job.id)
        self.assertTrue(evaluation.verdict_agrees)
        self.assertFalse(evaluation.severity_agrees)
        self.assertEqual(evaluation.severity_distance, 1)
        self.assertEqual(evaluation.severity_direction, AiQualityDirection.OVERESTIMATE)
        self.assertEqual(AuditLog.objects.count(), audit_count_before)

        case.status = CaseStatus.IN_PROGRESS
        case.save()
        sync_case_ai_quality_evaluation(case.id)
        self.assertFalse(AiQualityEvaluation.objects.filter(case=case).exists())

    def test_should_restrict_global_ai_quality_endpoints_to_admin(self):
        client = APIClient()
        client.force_authenticate(self.analyst)
        self.assertEqual(client.get("/api/ai-quality/summary/").status_code, 403)

        client.force_authenticate(self.admin)
        response = client.get("/api/ai-quality/summary/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("coverage", response.data)
        self.assertIn("field_agreements", response.data)
