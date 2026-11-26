from collections import Counter
from datetime import timedelta
import logging

from django.db.models import Avg, Count, Sum
from django.utils import timezone
from redis.exceptions import RedisError

from apps.agentic.models import AgenticJobStatus, CaseAnalysisJob
from apps.agentic.services.custom import (
    list_module_definitions_with_health,
    list_playbook_definition_records,
)
from apps.common.worker_health import get_worker_health_states
from apps.knowledge.models import Knowledge, KnowledgeSource
from apps.knowledge.vector_store import RedisKnowledgeVectorStore
from apps.settings.models import LLMProviderConfig
from apps.settings.runtime_config import get_prompt_language
from integrations.llm.embeddings import resolve_embedding_config

logger = logging.getLogger(__name__)
STANDARD_LLM_TAGS = ("fast", "powerful", "tool_calling", "structured_output")


def _p95(values):
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round(0.95 * (len(ordered) - 1)))))
    return ordered[index]


def _rate(numerator, denominator):
    if not denominator:
        return None
    return round((numerator / denominator) * 100, 1)


def _extract_report_summary(result_json):
    if not isinstance(result_json, dict):
        return "", ""
    report = result_json.get("report")
    if not isinstance(report, dict):
        return "", ""
    return str(report.get("verdict") or ""), str(report.get("confidence") or "")


def serialize_job_list_item(job):
    """Serialize a CaseAnalysisJob row for the Agent Monitor queue table."""
    verdict_ai, confidence_ai = _extract_report_summary(job.result_json)
    return {
        "id": str(job.id),
        "case_id": str(job.case_id),
        "case_readable_id": job.case.case_id,
        "case_title": job.case.title,
        "status": job.status,
        "trigger": job.trigger,
        "provider_name": job.provider_name,
        "model_name": job.model_name,
        "prompt_version": job.prompt_version,
        "latency_ms": job.latency_ms,
        "input_tokens": job.input_tokens,
        "output_tokens": job.output_tokens,
        "total_tokens": job.total_tokens,
        "knowledge_keywords_count": job.knowledge_keywords_count,
        "knowledge_records_count": job.knowledge_records_count,
        "verdict_ai": verdict_ai,
        "confidence_ai": confidence_ai,
        "scheduled_at": job.scheduled_at.isoformat() if job.scheduled_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "created_at": job.created_at.isoformat(),
        "error": job.error,
    }


def serialize_job_detail(job):
    """Serialize a CaseAnalysisJob row including full RAG & structured output payload."""
    data = serialize_job_list_item(job)
    data["queue_message_id"] = job.queue_message_id
    data["result_json"] = job.result_json
    return data


def _build_queue_metrics():
    status_rows = CaseAnalysisJob.objects.values("status").annotate(count=Count("id"))
    status_counts = {row["status"]: row["count"] for row in status_rows}

    since_24h = timezone.now() - timedelta(hours=24)
    recent_qs = CaseAnalysisJob.objects.filter(created_at__gte=since_24h)
    recent_success = recent_qs.filter(status=AgenticJobStatus.SUCCESS).count()
    recent_failed = recent_qs.filter(status=AgenticJobStatus.FAILED).count()
    recent_terminal = recent_success + recent_failed

    latency_values = list(
        recent_qs.filter(latency_ms__isnull=False).values_list("latency_ms", flat=True)
    )
    aggregates = recent_qs.aggregate(
        avg_latency=Avg("latency_ms"),
        input_tokens=Sum("input_tokens"),
        output_tokens=Sum("output_tokens"),
        total_tokens=Sum("total_tokens"),
    )

    return {
        "counts": {
            "pending": status_counts.get(AgenticJobStatus.PENDING, 0),
            "running": status_counts.get(AgenticJobStatus.RUNNING, 0),
            "success": status_counts.get(AgenticJobStatus.SUCCESS, 0),
            "failed": status_counts.get(AgenticJobStatus.FAILED, 0),
        },
        "last_24h": {
            "total": recent_qs.count(),
            "success": recent_success,
            "failed": recent_failed,
            "success_rate": _rate(recent_success, recent_terminal),
            "avg_latency_ms": round(aggregates["avg_latency"]) if aggregates["avg_latency"] is not None else None,
            "p95_latency_ms": _p95(latency_values),
            "input_tokens": aggregates["input_tokens"] or 0,
            "output_tokens": aggregates["output_tokens"] or 0,
            "total_tokens": aggregates["total_tokens"] or 0,
        },
    }


def _build_llm_summary():
    providers = list(
        LLMProviderConfig.objects.order_by("priority", "name", "created_at")
        .values("id", "name", "base_url", "model", "tags", "enabled", "priority")
    )
    tag_coverage = {tag: 0 for tag in STANDARD_LLM_TAGS}
    safe_providers = []
    enabled_count = 0

    for item in providers:
        tags = item.get("tags") or []
        if item["enabled"]:
            enabled_count += 1
            for tag in tags:
                if tag in tag_coverage:
                    tag_coverage[tag] += 1
        safe_providers.append({
            "id": str(item["id"]),
            "name": item["name"],
            "base_url": item["base_url"],
            "model": item["model"],
            "tags": tags,
            "enabled": item["enabled"],
            "priority": item["priority"],
        })

    return {
        "total": len(safe_providers),
        "enabled": enabled_count,
        "tag_coverage": tag_coverage,
        "providers": safe_providers,
    }


def _build_rag_summary():
    source_rows = Knowledge.objects.values("source").annotate(count=Count("id"))
    source_counts = {row["source"]: row["count"] for row in source_rows}
    total_knowledge = sum(source_counts.values())
    indexed_knowledge = Knowledge.objects.filter(embedding_dimensions__gt=0).count()

    embedding_config = resolve_embedding_config()
    try:
        vector_stats = RedisKnowledgeVectorStore().stats()
    except Exception:
        vector_stats = {"available": False, "index_name": "", "docs": 0, "dimensions": None}

    keyword_counter = Counter()
    recent_results = (
        CaseAnalysisJob.objects.filter(status=AgenticJobStatus.SUCCESS)
        .order_by("-completed_at", "-created_at")
        .values_list("result_json", flat=True)[:50]
    )
    for result_json in recent_results:
        if not isinstance(result_json, dict):
            continue
        for kw in result_json.get("knowledge_keywords") or []:
            if isinstance(kw, str) and kw.strip():
                keyword_counter[kw.strip()] += 1

    return {
        "mode": "hybrid" if embedding_config else "lexical",
        "total_knowledge": total_knowledge,
        "manual_knowledge": source_counts.get(KnowledgeSource.MANUAL, 0),
        "case_knowledge": source_counts.get(KnowledgeSource.CASE, 0),
        "indexed_knowledge": indexed_knowledge,
        "embedding_configured": bool(embedding_config),
        "embedding_model": embedding_config.get("model", "") if embedding_config else "",
        "redis_vector_available": bool(vector_stats.get("available")),
        "redis_vector_docs": int(vector_stats.get("docs") or 0),
        "redis_vector_dimensions": vector_stats.get("dimensions"),
        "top_keywords": [
            {"keyword": keyword, "count": count}
            for keyword, count in keyword_counter.most_common(15)
        ],
    }


def _safe_workers_snapshot():
    try:
        return get_worker_health_states(), True
    except RedisError:
        logger.warning("Worker health unavailable while building agentic overview.")
        return [], False


def _safe_runtime_catalog():
    playbooks = list_playbook_definition_records()
    try:
        modules = list_module_definitions_with_health()
    except Exception:
        logger.exception("Failed to read module definitions for agentic overview.")
        modules = {"section": "modules", "success": False, "counts": {"items": 0, "errors": 1}, "items": [], "errors": []}
    return {
        "prompt_language": get_prompt_language(),
        "playbooks": playbooks,
        "modules": modules,
    }


def build_agentic_overview():
    """Aggregate Agent Monitor telemetry, RAG stats, LLM coverage, and worker runtime catalog."""
    workers, workers_available = _safe_workers_snapshot()
    return {
        "queue": _build_queue_metrics(),
        "llm": _build_llm_summary(),
        "rag": _build_rag_summary(),
        "runtime": _safe_runtime_catalog(),
        "workers": workers,
        "workers_available": workers_available,
    }
