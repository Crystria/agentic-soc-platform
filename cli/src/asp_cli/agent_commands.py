from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlencode

from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.table import Table

from .errors import CliError, EXIT_USAGE
from .output import OutputFormat, key_value_table


def _format_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(str(item) for item in value)
    if isinstance(value, dict):
        return ", ".join(f"{key}={val}" for key, val in value.items())
    return str(value)


def build_table(title: str, columns: list[str], rows: list[dict[str, Any]], caption: str | None = None) -> Table:
    """Build a Rich table from API record dictionaries."""
    table = Table(title=title)
    for col in columns:
        table.add_column(col)
    for row in rows or []:
        table.add_row(*[_format_value(row.get(col)) for col in columns])
    if caption:
        table.caption = caption
    return table


def render_case_report(console: Console, data: dict[str, Any]) -> None:
    """Render an AI Investigation Report and AI-Human Alignment summary in text mode."""
    case_id = str(data.get("case_id") or "").upper()
    title = str(data.get("title") or "")
    status_val = str(data.get("status") or "")
    raw_report = data.get("investigation_report") or {}
    report = raw_report.get("report") if isinstance(raw_report, dict) and isinstance(raw_report.get("report"), dict) else raw_report

    console.print(Panel(f"[bold cyan]{case_id}[/bold cyan] · {title}  [dim](status: {status_val})[/dim]", title="ASP Case Investigation Report"))

    if isinstance(report, dict) and report:
        console.print(
            key_value_table(
                "AI Assessment",
                [
                    ("Verdict", report.get("verdict")),
                    ("Severity", report.get("severity")),
                    ("Impact", report.get("impact")),
                    ("Priority", report.get("priority")),
                    ("Confidence", report.get("confidence")),
                ],
            )
        )
        if digest := report.get("digest"):
            console.print(Panel(str(digest), title="Incident Digest", border_style="blue"))

        if findings := report.get("evidence_findings") or []:
            console.print(build_table("Evidence Findings", ["title", "finding_type", "subject", "conclusion"], findings))
        if chain := report.get("attack_chain") or []:
            console.print(build_table("Attack Chain (MITRE ATT&CK)", ["attack_stage", "description"], chain))
        if iocs := report.get("ioc_indicators") or []:
            console.print(build_table("IOC Indicators", ["indicator_type", "value", "context"], iocs))
        if remediations := report.get("remediations") or []:
            console.print(build_table("Remediation Recommendations", ["action_type", "priority", "description"], remediations))
        if unknowns := report.get("unknowns") or []:
            console.print(Panel("\n".join(f"- {item}" for item in unknowns), title="Unknowns / Evidence Gaps", border_style="yellow"))
    else:
        console.print("[yellow]No structured AI investigation report has been generated for this Case yet.[/yellow]")

    quality = data.get("ai_quality") or {}
    fields = quality.get("fields") or []
    if fields:
        console.print(
            build_table(
                f"AI-Human Alignment ({quality.get('coverage_state', '')})",
                ["label", "ai_value", "human_value", "agrees", "direction", "distance"],
                fields,
            )
        )


def render_agent_overview(console: Console, data: dict[str, Any]) -> None:
    """Render Agent Monitor KPIs, LLM coverage, RAG keywords, and workers."""
    queue = data.get("queue") or {}
    counts = queue.get("counts") or {}
    last_24h = queue.get("last_24h") or {}
    rag = data.get("rag") or {}
    llm = data.get("llm") or {}

    console.print(
        key_value_table(
            "Agent Queue & Telemetry (24h)",
            [
                ("Pending / Running", f"{counts.get('pending', 0)} / {counts.get('running', 0)}"),
                ("Success / Failed (Total)", f"{counts.get('success', 0)} / {counts.get('failed', 0)}"),
                ("24h Success Rate", f"{last_24h.get('success_rate')}%" if last_24h.get("success_rate") is not None else "—"),
                ("Avg / P95 Latency (ms)", f"{last_24h.get('avg_latency_ms') or '—'} / {last_24h.get('p95_latency_ms') or '—'}"),
                ("24h Tokens (In/Out/Total)", f"{last_24h.get('input_tokens', 0)} / {last_24h.get('output_tokens', 0)} / {last_24h.get('total_tokens', 0)}"),
                ("LLM Providers Enabled", f"{llm.get('enabled', 0)} / {llm.get('total', 0)}"),
                ("LLM Tag Coverage", _format_value(llm.get("tag_coverage") or {})),
                ("Knowledge Base (Manual/Case/Total)", f"{rag.get('manual_knowledge', 0)} / {rag.get('case_knowledge', 0)} / {rag.get('total_knowledge', 0)}"),
            ],
        )
    )

    if workers := data.get("workers") or []:
        console.print(build_table("Background Workers", ["display_name", "state", "reason", "last_duration_ms"], workers))

    if top_keywords := rag.get("top_keywords") or []:
        console.print(build_table("Top Recent RAG Keywords", ["keyword", "count"], top_keywords))


def wait_for_analysis_job(client: Any, console: Console, job: dict[str, Any], *, interval: float = 2.0, timeout: float = 120.0) -> dict[str, Any]:
    """Poll an analysis job until it reaches Success/Failed or timeout expires."""
    job_id = str(job.get("id") or "")
    if not job_id:
        return job

    deadline = time.monotonic() + max(1.0, timeout)
    current = job
    with console.status(f"Waiting for CaseAnalysisJob {job_id}...") as status_spinner:
        while current.get("status") in {"Pending", "Running"} and time.monotonic() < deadline:
            time.sleep(max(0.5, interval))
            try:
                resp = client.request("GET", f"/api/agent/v1/agent/jobs/{job_id}/")
                current = resp.get("data") or current
            except CliError:
                break
            status_spinner.update(f"Job {job_id}: {current.get('status')}")
    return current


def build_decision_payload(
    *,
    accept_ai: bool,
    fields_csv: str | None,
    verdict: str | None,
    severity: str | None,
    impact: str | None,
    priority: str | None,
    confidence: str | None,
    status: str | None,
    apply_digest: bool,
    note: str | None,
) -> dict[str, Any]:
    """Construct validated request JSON for POST /api/agent/v1/cases/{id}/decide/."""
    body: dict[str, Any] = {}
    if accept_ai:
        body["accept_ai"] = True
    if fields_csv:
        body["fields"] = [item.strip() for item in fields_csv.split(",") if item.strip()]
    if apply_digest:
        body["apply_digest_to_summary"] = True
    if note:
        body["decision_note"] = note

    for key, val in (
        ("verdict", verdict),
        ("severity", severity),
        ("impact", impact),
        ("priority", priority),
        ("confidence", confidence),
        ("status", status),
    ):
        if val is not None:
            body[key] = val

    if not any(
        key in body
        for key in ("accept_ai", "fields", "apply_digest_to_summary", "verdict", "severity", "impact", "priority", "confidence", "status")
    ):
        raise CliError(
            "missing_decision_fields",
            "Provide --accept-ai, --fields, --apply-digest, or explicit decision options (--verdict/--severity/--status...).",
            {},
            EXIT_USAGE,
        )
    return body


def tail_agent_jobs(client: Any, console: Console, *, status_filter: str | None = None, case_id: str | None = None, interval: float = 3.0) -> None:
    """Continuously render the CaseAnalysisJob queue in the terminal until Ctrl+C."""
    params: dict[str, Any] = {"page_size": 20}
    if status_filter:
        params["status"] = status_filter
    if case_id:
        params["case_id"] = case_id
    path = "/api/agent/v1/agent/jobs/"
    if params:
        path = f"{path}?{urlencode(params)}"

    def _fetch_table() -> Table:
        payload = client.request("GET", path)
        rows = payload.get("data") or []
        return build_table(
            f"Agent Analysis Queue (refresh {interval}s · Ctrl+C to exit)",
            ["case_readable_id", "status", "trigger", "model_name", "total_tokens", "latency_ms", "verdict_ai", "created_at"],
            rows,
        )

    try:
        with Live(_fetch_table(), console=console, refresh_per_second=1) as live:
            while True:
                time.sleep(max(1.0, interval))
                live.update(_fetch_table())
    except KeyboardInterrupt:
        console.print("\n[dim]Stopped tailing agent jobs.[/dim]")
