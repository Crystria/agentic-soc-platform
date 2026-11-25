from __future__ import annotations

import importlib.util
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt

from .agent_commands import build_table, render_agent_overview, render_case_report
from .errors import CliError


def textual_available() -> bool:
    """Return True if the optional textual library is installed."""
    return importlib.util.find_spec("textual") is not None


class RichInteractiveTui:
    """Zero-extra-dependency interactive textmode console powered by Rich."""

    def __init__(self, client: Any, console: Console | None = None) -> None:
        self.client = client
        self.console = console or Console()
        self.active_view = "cases"

    def run(self) -> None:
        self.console.print(
            Panel(
                "[bold cyan]Agentic SOC Platform — Interactive Textmode Console[/bold cyan]\n"
                "Commands: [bold]1[/bold] Cases  [bold]2[/bold] Alerts  [bold]3[/bold] Playbooks  "
                "[bold]4[/bold] Agent Queue  [bold]s <id>[/bold] Report  [bold]a <id>[/bold] Accept AI  "
                "[bold]z <id>[/bold] Analyze  [bold]y <pb_id>[/bold] Approve  [bold]n <pb_id>[/bold] Reject  "
                "[bold]r[/bold] Refresh  [bold]q[/bold] Quit",
                border_style="blue",
            )
        )
        self._render_current_view()

        while True:
            try:
                raw = Prompt.ask(f"[bold cyan]asp-tui ({self.active_view})[/bold cyan]", default="r").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if not raw:
                continue
            parts = raw.split(maxsplit=1)
            cmd = parts[0].lower()
            arg = parts[1].strip() if len(parts) > 1 else ""

            if cmd in {"q", "quit", "exit"}:
                break
            if cmd == "1":
                self.active_view = "cases"
                self._render_current_view()
            elif cmd == "2":
                self.active_view = "alerts"
                self._render_current_view()
            elif cmd == "3":
                self.active_view = "playbooks"
                self._render_current_view()
            elif cmd == "4":
                self.active_view = "agent"
                self._render_current_view()
            elif cmd == "r":
                self._render_current_view()
            elif cmd == "s" and arg:
                self._safe_call(lambda: render_case_report(self.console, self.client.request("GET", f"/api/agent/v1/cases/{arg}/report/").get("data") or {}))
            elif cmd == "a" and arg:
                self._safe_call(lambda: self._accept_ai(arg))
            elif cmd == "z" and arg:
                self._safe_call(lambda: self._trigger_analyze(arg))
            elif cmd == "y" and arg:
                self._safe_call(lambda: self._approve_playbook(arg))
            elif cmd == "n" and arg:
                self._safe_call(lambda: self._reject_playbook(arg))
            else:
                self.console.print("[yellow]Unknown command. Use 1-4, s/a/z <case_id>, y/n <playbook_id>, r, or q.[/yellow]")

    def _safe_call(self, fn) -> None:
        try:
            fn()
        except CliError as exc:
            self.console.print(f"[red]Error: {exc.message}[/red]")

    def _accept_ai(self, case_id: str) -> None:
        resp = self.client.request(
            "POST",
            f"/api/agent/v1/cases/{case_id}/decide/",
            json={"accept_ai": True, "apply_digest_to_summary": True},
        )
        applied = (resp.get("data") or {}).get("applied_fields") or []
        self.console.print(f"[green]Applied AI assessment to {case_id.upper()}: {', '.join(applied)}[/green]")

    def _trigger_analyze(self, case_id: str) -> None:
        resp = self.client.request("POST", f"/api/agent/v1/cases/{case_id}/analyze/")
        job = resp.get("data") or {}
        self.console.print(f"[green]Queued AI analysis job {job.get('id')} ({job.get('status')}) for {case_id.upper()}[/green]")

    def _approve_playbook(self, playbook_id: str) -> None:
        self.client.request("POST", f"/api/agent/v1/playbooks/{playbook_id}/approve/", json={"note": "Approved in asp tui"})
        self.console.print(f"[green]Approved playbook {playbook_id.upper()}[/green]")

    def _reject_playbook(self, playbook_id: str) -> None:
        self.client.request("POST", f"/api/agent/v1/playbooks/{playbook_id}/reject/", json={"note": "Rejected in asp tui"})
        self.console.print(f"[yellow]Rejected playbook {playbook_id.upper()}[/yellow]")

    def _render_current_view(self) -> None:
        def _draw() -> None:
            if self.active_view == "cases":
                rows = self.client.request("GET", "/api/agent/v1/cases/?page_size=20").get("data") or []
                self.console.print(build_table("Cases", ["case_id", "title", "status", "severity", "severity_ai", "verdict", "verdict_ai"], rows))
            elif self.active_view == "alerts":
                rows = self.client.request("GET", "/api/agent/v1/alerts/?page_size=20").get("data") or []
                self.console.print(build_table("Alerts", ["alert_id", "case_id", "title", "severity", "status", "rule_name"], rows))
            elif self.active_view == "playbooks":
                rows = self.client.request("GET", "/api/agent/v1/playbooks/?page_size=20").get("data") or []
                self.console.print(build_table("Playbooks", ["playbook_id", "case_id", "name", "risk_level", "job_status", "approved_by"], rows))
            elif self.active_view == "agent":
                overview = self.client.request("GET", "/api/agent/v1/agent/overview/").get("data") or {}
                render_agent_overview(self.console, overview)
                jobs = self.client.request("GET", "/api/agent/v1/agent/jobs/?page_size=15").get("data") or []
                self.console.print(build_table("Agent Jobs", ["case_readable_id", "status", "trigger", "model_name", "latency_ms", "total_tokens"], jobs))

        self._safe_call(_draw)


def _launch_textual_tui(client: Any, refresh_seconds: float) -> None:
    from textual.app import App, ComposeResult
    from textual.binding import Binding
    from textual.widgets import DataTable, Footer, Header, RichLog, TabbedContent, TabPane

    class AspTextualApp(App):
        TITLE = "Agentic SOC Platform — Terminal Command Center"
        BINDINGS = [
            Binding("r", "refresh_all", "Refresh"),
            Binding("a", "accept_ai", "Accept AI"),
            Binding("z", "trigger_analyze", "Analyze"),
            Binding("y", "approve_playbook", "Approve PB"),
            Binding("n", "reject_playbook", "Reject PB"),
            Binding("q", "quit", "Quit"),
        ]

        def __init__(self) -> None:
            super().__init__()
            self.client = client
            self.cases: list[dict[str, Any]] = []
            self.alerts: list[dict[str, Any]] = []
            self.playbooks: list[dict[str, Any]] = []
            self.jobs: list[dict[str, Any]] = []

        def compose(self) -> ComposeResult:
            yield Header()
            with TabbedContent(id="tabs"):
                with TabPane("Cases", id="tab-cases"):
                    yield DataTable(id="cases-table", cursor_type="row")
                with TabPane("Alerts", id="tab-alerts"):
                    yield DataTable(id="alerts-table", cursor_type="row")
                with TabPane("Playbooks", id="tab-playbooks"):
                    yield DataTable(id="playbooks-table", cursor_type="row")
                with TabPane("Agent Monitor", id="tab-agent"):
                    yield DataTable(id="jobs-table", cursor_type="row")
            yield RichLog(id="detail-log", wrap=True, highlight=True)
            yield Footer()

        def on_mount(self) -> None:
            self._setup_tables()
            self.action_refresh_all()
            if refresh_seconds > 0:
                self.set_interval(refresh_seconds, self.action_refresh_all)

        def _setup_tables(self) -> None:
            self.query_one("#cases-table", DataTable).add_columns("Case ID", "Title", "Status", "Severity", "AI Sev", "Verdict", "AI Verdict")
            self.query_one("#alerts-table", DataTable).add_columns("Alert ID", "Case", "Title", "Severity", "Status", "Rule")
            self.query_one("#playbooks-table", DataTable).add_columns("Playbook ID", "Case", "Name", "Risk", "Status", "Approved By")
            self.query_one("#jobs-table", DataTable).add_columns("Job ID", "Case", "Status", "Trigger", "Model", "Latency ms", "Tokens")

        def _selected_id(self, table_id: str) -> str | None:
            table = self.query_one(table_id, DataTable)
            if table.cursor_row is None or table.cursor_row < 0 or table.row_count == 0:
                return None
            row = table.get_row_at(table.cursor_row)
            return str(row[0]) if row else None

        def action_refresh_all(self) -> None:
            log = self.query_one("#detail-log", RichLog)
            try:
                self.cases = self.client.request("GET", "/api/agent/v1/cases/?page_size=30").get("data") or []
                self.alerts = self.client.request("GET", "/api/agent/v1/alerts/?page_size=30").get("data") or []
                self.playbooks = self.client.request("GET", "/api/agent/v1/playbooks/?page_size=30").get("data") or []
                try:
                    self.jobs = self.client.request("GET", "/api/agent/v1/agent/jobs/?page_size=30").get("data") or []
                except CliError:
                    self.jobs = []
                self._populate_tables()
            except CliError as exc:
                log.write(f"[red]Refresh failed: {exc.message}[/red]")

        def _populate_tables(self) -> None:
            cases_t = self.query_one("#cases-table", DataTable)
            cases_t.clear()
            for row in self.cases:
                cases_t.add_row(row.get("case_id", ""), row.get("title", ""), row.get("status", ""), row.get("severity", ""), row.get("severity_ai", ""), row.get("verdict", ""), row.get("verdict_ai", ""))

            alerts_t = self.query_one("#alerts-table", DataTable)
            alerts_t.clear()
            for row in self.alerts:
                alerts_t.add_row(row.get("alert_id", ""), row.get("case_id", ""), row.get("title", ""), row.get("severity", ""), row.get("status", ""), row.get("rule_name", ""))

            pb_t = self.query_one("#playbooks-table", DataTable)
            pb_t.clear()
            for row in self.playbooks:
                pb_t.add_row(row.get("playbook_id", ""), row.get("case_id", ""), row.get("name", ""), row.get("risk_level", ""), row.get("job_status", ""), row.get("approved_by", ""))

            jobs_t = self.query_one("#jobs-table", DataTable)
            jobs_t.clear()
            for row in self.jobs:
                jobs_t.add_row(row.get("id", ""), row.get("case_readable_id", ""), row.get("status", ""), row.get("trigger", ""), row.get("model_name", ""), str(row.get("latency_ms") or ""), str(row.get("total_tokens") or ""))

        def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
            log = self.query_one("#detail-log", RichLog)
            row = event.data_table.get_row(event.row_key)
            if not row:
                return
            rec_id = str(row[0])
            if event.data_table.id == "cases-table":
                try:
                    data = self.client.request("GET", f"/api/agent/v1/cases/{rec_id}/report/").get("data") or {}
                    report = (data.get("investigation_report") or {}).get("report") or {}
                    log.clear()
                    log.write(f"[bold cyan]{rec_id.upper()}[/bold cyan] | AI Verdict: {report.get('verdict', '—')} | Severity: {report.get('severity', '—')}")
                    if digest := report.get("digest"):
                        log.write(str(digest))
                except CliError as exc:
                    log.write(f"[red]{exc.message}[/red]")

        def action_accept_ai(self) -> None:
            case_id = self._selected_id("#cases-table")
            log = self.query_one("#detail-log", RichLog)
            if not case_id:
                log.write("[yellow]Select a Case row first.[/yellow]")
                return
            try:
                self.client.request("POST", f"/api/agent/v1/cases/{case_id}/decide/", json={"accept_ai": True})
                log.write(f"[green]Accepted AI assessment for {case_id.upper()}[/green]")
                self.action_refresh_all()
            except CliError as exc:
                log.write(f"[red]{exc.message}[/red]")

        def action_trigger_analyze(self) -> None:
            case_id = self._selected_id("#cases-table")
            log = self.query_one("#detail-log", RichLog)
            if not case_id:
                log.write("[yellow]Select a Case row first.[/yellow]")
                return
            try:
                resp = self.client.request("POST", f"/api/agent/v1/cases/{case_id}/analyze/")
                log.write(f"[green]Queued analysis job {(resp.get('data') or {}).get('id')} for {case_id.upper()}[/green]")
                self.action_refresh_all()
            except CliError as exc:
                log.write(f"[red]{exc.message}[/red]")

        def action_approve_playbook(self) -> None:
            pb_id = self._selected_id("#playbooks-table")
            log = self.query_one("#detail-log", RichLog)
            if not pb_id:
                log.write("[yellow]Select a Playbook row first.[/yellow]")
                return
            try:
                self.client.request("POST", f"/api/agent/v1/playbooks/{pb_id}/approve/", json={"note": "Approved in Textual TUI"})
                log.write(f"[green]Approved playbook {pb_id.upper()}[/green]")
                self.action_refresh_all()
            except CliError as exc:
                log.write(f"[red]{exc.message}[/red]")

        def action_reject_playbook(self) -> None:
            pb_id = self._selected_id("#playbooks-table")
            log = self.query_one("#detail-log", RichLog)
            if not pb_id:
                log.write("[yellow]Select a Playbook row first.[/yellow]")
                return
            try:
                self.client.request("POST", f"/api/agent/v1/playbooks/{pb_id}/reject/", json={"note": "Rejected in Textual TUI"})
                log.write(f"[yellow]Rejected playbook {pb_id.upper()}[/yellow]")
                self.action_refresh_all()
            except CliError as exc:
                log.write(f"[red]{exc.message}[/red]")

    AspTextualApp().run()


def launch_tui(client: Any, *, mode: str = "auto", refresh_seconds: float = 5.0, console: Console | None = None) -> None:
    """Launch either full Textual TUI (when installed) or zero-dependency Rich interactive TUI."""
    resolved_console = console or Console()
    normalized_mode = mode.strip().lower()
    if normalized_mode not in {"auto", "textual", "rich"}:
        raise ValueError("mode must be one of: auto, textual, rich")

    if normalized_mode == "textual":
        if not textual_available():
            raise CliError(
                "missing_textual",
                "Textual is not installed. Install with `pip install asp-cli[tui]` or run `asp tui --mode rich`.",
                {},
            )
        _launch_textual_tui(client, refresh_seconds)
        return

    if normalized_mode == "auto" and textual_available():
        _launch_textual_tui(client, refresh_seconds)
        return

    RichInteractiveTui(client, console=resolved_console).run()
