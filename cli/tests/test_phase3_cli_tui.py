import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

CLI_SRC = Path(__file__).resolve().parents[1] / "src"
if str(CLI_SRC) not in sys.path:
    sys.path.insert(0, str(CLI_SRC))


class Phase3OperationsSpecTests(unittest.TestCase):
    def test_operations_json_contains_phase3_commands(self):
        spec_path = CLI_SRC / "asp_cli" / "spec" / "operations.json"
        data = json.loads(spec_path.read_text(encoding="utf-8"))
        ids = {op["id"] for op in data["operations"]}
        for expected in (
            "case.report",
            "case.analyze",
            "case.decide",
            "playbook.approve",
            "playbook.reject",
            "agent.overview",
            "agent.jobs.list",
            "agent.jobs.retry",
            "agent.jobs.cancel",
            "tui",
        ):
            self.assertIn(expected, ids)


class Phase3HelperLogicTests(unittest.TestCase):
    def test_build_decision_payload_validates_empty_and_accept_ai(self):
        try:
            from asp_cli.agent_commands import build_decision_payload
            from asp_cli.errors import CliError
        except ModuleNotFoundError:
            self.skipTest("rich/typer not installed in local global Python")

        with self.assertRaises(CliError):
            build_decision_payload(
                accept_ai=False,
                fields_csv=None,
                verdict=None,
                severity=None,
                impact=None,
                priority=None,
                confidence=None,
                status=None,
                apply_digest=False,
                note="only note",
            )

        payload = build_decision_payload(
            accept_ai=True,
            fields_csv="verdict, severity",
            verdict=None,
            severity=None,
            impact=None,
            priority=None,
            confidence=None,
            status="In Progress",
            apply_digest=True,
            note="Confirmed",
        )
        self.assertTrue(payload["accept_ai"])
        self.assertEqual(payload["fields"], ["verdict", "severity"])
        self.assertEqual(payload["status"], "In Progress")
        self.assertTrue(payload["apply_digest_to_summary"])
        self.assertEqual(payload["decision_note"], "Confirmed")

    def test_rich_tui_accept_ai_calls_agent_decide_endpoint(self):
        try:
            from asp_cli.tui import RichInteractiveTui
        except ModuleNotFoundError:
            self.skipTest("rich not installed in local global Python")

        fake_client = MagicMock()
        fake_client.request.return_value = {"data": {"applied_fields": ["verdict", "severity"]}}
        tui = RichInteractiveTui(fake_client)
        tui._accept_ai("case_000001")
        fake_client.request.assert_called_once_with(
            "POST",
            "/api/agent/v1/cases/case_000001/decide/",
            json={"accept_ai": True, "apply_digest_to_summary": True},
        )


if __name__ == "__main__":
    unittest.main()
