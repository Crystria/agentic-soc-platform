import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.permissions import ROLE_USER, set_user_role
from apps.agentic.services.playbooks import (
    approve_playbook_run,
    claim_pending_playbook_run,
    create_pending_playbook_run,
    reject_playbook_run,
)
from apps.cases.models import Case
from apps.playbooks.models import PlaybookJobStatus


class PlaybookApprovalGateTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.analyst = user_model.objects.create_user(username="pb_analyst", password="password")
        set_user_role(self.analyst, ROLE_USER)
        self.case = Case.objects.create(title="Playbook approval test case")

    def test_should_require_approval_for_high_risk_playbook_and_block_worker_claim(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            script_path = Path(tmpdir) / "high_risk_action.py"
            script_path.write_text(
                "\n".join(
                    [
                        "from apps.agentic.runtime.base import BasePlaybook",
                        "class Playbook(BasePlaybook):",
                        "    NAME = 'Isolate Host'",
                        "    RISK_LEVEL = 'High'",
                        "    def run(self):",
                        "        return 'isolated'",
                    ]
                ),
                encoding="utf-8",
            )
            from unittest.mock import patch

            with patch(
                "apps.agentic.services.playbooks.default_playbook_script_dirs",
                return_value=[Path(tmpdir)],
            ):
                run = create_pending_playbook_run(
                    name="Isolate Host",
                    case=self.case,
                    user=self.analyst,
                    user_input="Contain host-1",
                )

        self.assertEqual(run.job_status, PlaybookJobStatus.AWAITING_APPROVAL)
        self.assertTrue(run.requires_approval)
        self.assertIsNone(claim_pending_playbook_run())

        approved = approve_playbook_run(run, user=self.analyst, note="Verified C2 traffic")
        self.assertEqual(approved.job_status, PlaybookJobStatus.PENDING)
        self.assertEqual(approved.approved_by_id, self.analyst.id)

        claimed = claim_pending_playbook_run()
        self.assertIsNotNone(claimed)
        self.assertEqual(claimed.id, run.id)

    def test_should_reject_awaiting_playbook_via_api(self):
        run = create_pending_playbook_run(
            name="Investigation",
            case=self.case,
            user=self.analyst,
            require_approval=True,
        )
        client = APIClient()
        client.force_authenticate(self.analyst)

        response = client.post(
            f"/api/playbooks/{run.id}/reject/",
            {"note": "False positive alert"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        run.refresh_from_db()
        self.assertEqual(run.job_status, PlaybookJobStatus.REJECTED)
        self.assertEqual(run.approval_note, "False positive alert")

    def test_should_fail_reject_if_already_pending(self):
        run = create_pending_playbook_run(
            name="Investigation",
            case=self.case,
            user=self.analyst,
            require_approval=False,
        )
        with self.assertRaises(ValueError):
            reject_playbook_run(run, user=self.analyst, note="Too late")
