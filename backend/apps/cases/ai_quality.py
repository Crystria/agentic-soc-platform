import logging
from collections import Counter, defaultdict
from datetime import timedelta

from django.db.models import F, Q
from django.db.models.functions import TruncDay, TruncMonth, TruncWeek
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from apps.agentic.models import AgenticJobStatus, CaseAnalysisJob
from .models import (
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

logger = logging.getLogger(__name__)

ORDINAL_FIELDS = ("severity", "impact", "priority", "confidence")
EVALUATED_FIELDS = ("verdict", *ORDINAL_FIELDS)
FIELD_LABELS = {
    "verdict": "Verdict",
    "severity": "Severity",
    "impact": "Impact",
    "priority": "Priority",
    "confidence": "Confidence",
}

ORDINAL_SCALES = {
    "severity": {
        CaseSeverity.INFORMATIONAL: 0,
        CaseSeverity.LOW: 1,
        CaseSeverity.MEDIUM: 2,
        CaseSeverity.HIGH: 3,
        CaseSeverity.CRITICAL: 4,
    },
    "impact": {
        CaseImpact.LOW: 0,
        CaseImpact.MEDIUM: 1,
        CaseImpact.HIGH: 2,
        CaseImpact.CRITICAL: 3,
    },
    "priority": {
        CasePriority.LOW: 0,
        CasePriority.MEDIUM: 1,
        CasePriority.HIGH: 2,
        CasePriority.CRITICAL: 3,
    },
    "confidence": {
        CaseConfidence.LOW: 0,
        CaseConfidence.MEDIUM: 1,
        CaseConfidence.HIGH: 2,
    },
}

VALID_CHOICE_SETS = {
    "verdict": set(CaseVerdict.values),
    "severity": set(CaseSeverity.values),
    "impact": set(CaseImpact.values),
    "priority": set(CasePriority.values),
    "confidence": set(CaseConfidence.values),
}


def _clean_choice(value):
    if value is None:
        return ""
    return str(value).strip()


def compare_verdict(ai_value, human_value):
    """Compare categorical Verdict values using exact agreement when both are present."""
    ai_clean = _clean_choice(ai_value)
    human_clean = _clean_choice(human_value)
    agrees = (ai_clean == human_clean) if (ai_clean and human_clean) else None
    return {
        "ai_value": ai_clean,
        "human_value": human_clean,
        "agrees": agrees,
        "distance": None,
        "direction": "",
    }


def compare_ordinal_field(field_name, ai_value, human_value):
    """Compare ordinal assessment fields with exact agreement and directional distance."""
    ai_clean = _clean_choice(ai_value)
    human_clean = _clean_choice(human_value)
    if not ai_clean or not human_clean:
        return {
            "ai_value": ai_clean,
            "human_value": human_clean,
            "agrees": None,
            "distance": None,
            "direction": "",
        }

    agrees = ai_clean == human_clean
    scale = ORDINAL_SCALES[field_name]
    if ai_clean == "Unknown" or human_clean == "Unknown" or ai_clean not in scale or human_clean not in scale:
        return {
            "ai_value": ai_clean,
            "human_value": human_clean,
            "agrees": agrees,
            "distance": None,
            "direction": "",
        }

    ai_rank = scale[ai_clean]
    human_rank = scale[human_clean]
    distance = abs(ai_rank - human_rank)
    if ai_rank == human_rank:
        direction = AiQualityDirection.MATCH
    elif ai_rank > human_rank:
        direction = AiQualityDirection.OVERESTIMATE
    else:
        direction = AiQualityDirection.UNDERESTIMATE

    return {
        "ai_value": ai_clean,
        "human_value": human_clean,
        "agrees": agrees,
        "distance": distance,
        "direction": direction,
    }


def compare_case_values(ai_values, human_values):
    """Compare all five structured assessment fields between AI and human inputs."""
    comparisons = {"verdict": compare_verdict(ai_values.get("verdict"), human_values.get("verdict"))}
    for field_name in ORDINAL_FIELDS:
        comparisons[field_name] = compare_ordinal_field(
            field_name,
            ai_values.get(field_name),
            human_values.get(field_name),
        )
    return comparisons


def select_reference_job(case):
    """Select the last successful AI analysis job completed at or before Case closure."""
    if not case.closed_time:
        return None
    return (
        CaseAnalysisJob.objects.filter(
            case=case,
            status=AgenticJobStatus.SUCCESS,
            completed_at__isnull=False,
            completed_at__lte=case.closed_time,
        )
        .order_by("-completed_at", "-created_at")
        .first()
    )


def extract_job_ai_values(job):
    """Parse structured AI decision values from a CaseAnalysisJob.result_json payload."""
    result_json = getattr(job, "result_json", None)
    if not isinstance(result_json, dict):
        return AiQualityCoverageState.INVALID_PREDICTION, {}

    report = result_json.get("report")
    if not isinstance(report, dict):
        return AiQualityCoverageState.INVALID_PREDICTION, {}

    extracted = {}
    for field_name in EVALUATED_FIELDS:
        raw_value = _clean_choice(report.get(field_name, ""))
        if raw_value and raw_value not in VALID_CHOICE_SETS[field_name]:
            return AiQualityCoverageState.INVALID_PREDICTION, {}
        extracted[field_name] = raw_value

    return AiQualityCoverageState.EVALUATED, extracted


def _empty_comparison_map():
    return {
        field_name: {
            "ai_value": "",
            "human_value": "",
            "agrees": None,
            "distance": None,
            "direction": "",
        }
        for field_name in EVALUATED_FIELDS
    }


def sync_case_ai_quality_evaluation(case_id):
    """Create, update, or remove the AiQualityEvaluation snapshot for a Case."""
    case = Case.objects.select_related("assignee").filter(pk=case_id).first()
    if case is None or case.status != CaseStatus.CLOSED or case.closed_time is None:
        AiQualityEvaluation.objects.filter(case_id=case_id).delete()
        return None

    reference_job = select_reference_job(case)
    human_values = {field_name: _clean_choice(getattr(case, field_name, "")) for field_name in EVALUATED_FIELDS}

    if reference_job is None:
        coverage_state = AiQualityCoverageState.NO_PREDICTION
        comparisons = compare_case_values({}, human_values)
    else:
        coverage_state, ai_values = extract_job_ai_values(reference_job)
        if coverage_state == AiQualityCoverageState.INVALID_PREDICTION:
            comparisons = compare_case_values({}, human_values)
        else:
            comparisons = compare_case_values(ai_values, human_values)

    defaults = {
        "reference_job": reference_job,
        "coverage_state": coverage_state,
        "ai_verdict": comparisons["verdict"]["ai_value"],
        "human_verdict": comparisons["verdict"]["human_value"],
        "verdict_agrees": comparisons["verdict"]["agrees"],
        "category_snapshot": _clean_choice(case.category),
        "assignee_snapshot": case.assignee,
        "closed_at": case.closed_time,
        "evaluated_at": timezone.now(),
    }
    for field_name in ORDINAL_FIELDS:
        item = comparisons[field_name]
        defaults[f"ai_{field_name}"] = item["ai_value"]
        defaults[f"human_{field_name}"] = item["human_value"]
        defaults[f"{field_name}_agrees"] = item["agrees"]
        defaults[f"{field_name}_distance"] = item["distance"]
        defaults[f"{field_name}_direction"] = item["direction"]

    evaluation, _ = AiQualityEvaluation.objects.update_or_create(case=case, defaults=defaults)
    return evaluation


def safe_sync_case_ai_quality_evaluation(case_id):
    """Run evaluation sync with failure isolation so Case operations never fail."""
    try:
        return sync_case_ai_quality_evaluation(case_id)
    except Exception:
        logger.exception("Failed to synchronize AI quality evaluation for case_id=%s", case_id)
        return None


def _evaluation_rows_from_comparisons(comparisons):
    return [
        {
            "field": field_name,
            "label": FIELD_LABELS[field_name],
            **comparisons[field_name],
        }
        for field_name in EVALUATED_FIELDS
    ]


def get_case_ai_quality_payload(case):
    """Return read-only Case-level AI vs Human comparison without exposing model/prompt metadata."""
    evaluation = (
        AiQualityEvaluation.objects.filter(case=case).first()
        if case.status == CaseStatus.CLOSED
        else None
    )
    if evaluation is not None:
        comparisons = {
            "verdict": {
                "ai_value": evaluation.ai_verdict,
                "human_value": evaluation.human_verdict,
                "agrees": evaluation.verdict_agrees,
                "distance": None,
                "direction": "",
            }
        }
        for field_name in ORDINAL_FIELDS:
            comparisons[field_name] = {
                "ai_value": getattr(evaluation, f"ai_{field_name}"),
                "human_value": getattr(evaluation, f"human_{field_name}"),
                "agrees": getattr(evaluation, f"{field_name}_agrees"),
                "distance": getattr(evaluation, f"{field_name}_distance"),
                "direction": getattr(evaluation, f"{field_name}_direction"),
            }
        return {
            "case_id": str(case.id),
            "coverage_state": evaluation.coverage_state,
            "is_preview": False,
            "closed_at": evaluation.closed_at.isoformat(),
            "evaluated_at": evaluation.evaluated_at.isoformat(),
            "fields": _evaluation_rows_from_comparisons(comparisons),
        }

    ai_values = {field_name: _clean_choice(getattr(case, f"{field_name}_ai", "")) for field_name in EVALUATED_FIELDS}
    human_values = {field_name: _clean_choice(getattr(case, field_name, "")) for field_name in EVALUATED_FIELDS}
    has_ai_prediction = any(ai_values.values())
    comparisons = compare_case_values(ai_values, human_values) if has_ai_prediction else compare_case_values({}, human_values)
    coverage_state = (
        AiQualityCoverageState.EVALUATED
        if has_ai_prediction
        else AiQualityCoverageState.NO_PREDICTION
    )
    return {
        "case_id": str(case.id),
        "coverage_state": coverage_state,
        "is_preview": True,
        "closed_at": case.closed_time.isoformat() if case.closed_time else None,
        "evaluated_at": None,
        "fields": _evaluation_rows_from_comparisons(comparisons),
    }


def _parse_bound(raw_value, *, end_of_day=False):
    if not raw_value:
        return None
    parsed_dt = parse_datetime(str(raw_value))
    if parsed_dt is not None:
        return timezone.make_aware(parsed_dt) if timezone.is_naive(parsed_dt) else parsed_dt
    parsed_d = parse_date(str(raw_value))
    if parsed_d is None:
        return None
    dt = timezone.datetime(parsed_d.year, parsed_d.month, parsed_d.day)
    if end_of_day:
        dt = dt + timedelta(days=1) - timedelta(microseconds=1)
    return timezone.make_aware(dt)


def resolve_time_window(params):
    """Resolve closed_at filtering window (defaults to the last 30 days)."""
    now = timezone.now()
    start = _parse_bound(params.get("start"), end_of_day=False)
    end = _parse_bound(params.get("end"), end_of_day=True)

    if start is None and end is None:
        try:
            days = max(1, min(int(params.get("days", 30)), 3650))
        except (TypeError, ValueError):
            days = 30
        end = now
        start = now - timedelta(days=days)
    elif start is None:
        start = end - timedelta(days=30)
    elif end is None:
        end = now

    span_days = max(1, (end - start).days + 1)
    return start, end, span_days


def filter_evaluations(params):
    """Build filtered AiQualityEvaluation queryset using spec-defined snapshot dimensions."""
    start, end, span_days = resolve_time_window(params)
    queryset = AiQualityEvaluation.objects.select_related("case", "assignee_snapshot").filter(
        closed_at__gte=start,
        closed_at__lte=end,
    )

    category = _clean_choice(params.get("category"))
    if category:
        queryset = queryset.filter(category_snapshot=category)

    human_severity = _clean_choice(params.get("human_severity"))
    if human_severity:
        queryset = queryset.filter(human_severity=human_severity)

    assignee = _clean_choice(params.get("assignee"))
    if assignee:
        queryset = queryset.filter(assignee_snapshot_id=assignee)

    coverage_state = _clean_choice(params.get("coverage_state"))
    if coverage_state:
        queryset = queryset.filter(coverage_state=coverage_state)

    mismatch_field = _clean_choice(params.get("mismatch_field"))
    if mismatch_field in EVALUATED_FIELDS:
        queryset = queryset.filter(**{f"{mismatch_field}_agrees": False})

    only_mismatches = str(params.get("only_mismatches", "")).lower() in {"1", "true", "yes"}
    if only_mismatches:
        mismatch_q = Q()
        for field_name in EVALUATED_FIELDS:
            mismatch_q |= Q(**{f"{field_name}_agrees": False})
        queryset = queryset.filter(mismatch_q)

    return queryset, start, end, span_days


def _rate(numerator, denominator):
    if not denominator:
        return None
    return round((numerator / denominator) * 100, 1)


def _trend_granularity(span_days):
    if span_days <= 31:
        return "daily", TruncDay("closed_at")
    if span_days <= 180:
        return "weekly", TruncWeek("closed_at")
    return "monthly", TruncMonth("closed_at")


def build_ai_quality_summary(params):
    """Aggregate global AI-Human Agreement metrics directly from PostgreSQL evaluations."""
    queryset, start, end, span_days = filter_evaluations(params)
    rows = list(
        queryset.values(
            "coverage_state",
            "ai_verdict",
            "human_verdict",
            "verdict_agrees",
            *(
                col
                for field_name in ORDINAL_FIELDS
                for col in (
                    f"{field_name}_agrees",
                    f"{field_name}_distance",
                    f"{field_name}_direction",
                )
            ),
        )
    )

    total_closed = len(rows)
    cov_counts = Counter(row["coverage_state"] for row in rows)
    evaluated_count = cov_counts.get(AiQualityCoverageState.EVALUATED, 0)
    no_prediction_count = cov_counts.get(AiQualityCoverageState.NO_PREDICTION, 0)
    invalid_prediction_count = cov_counts.get(AiQualityCoverageState.INVALID_PREDICTION, 0)

    field_agreements = {}
    for field_name in EVALUATED_FIELDS:
        agrees_key = f"{field_name}_agrees"
        evaluable = [row for row in rows if row[agrees_key] is not None]
        agreed = sum(1 for row in evaluable if row[agrees_key] is True)
        field_agreements[field_name] = {
            "field": field_name,
            "label": FIELD_LABELS[field_name],
            "agreed_count": agreed,
            "evaluable_count": len(evaluable),
            "agreement_rate": _rate(agreed, len(evaluable)),
        }

    matrix_counter = Counter()
    matrix_labels = set()
    for row in rows:
        if row["coverage_state"] != AiQualityCoverageState.EVALUATED:
            continue
        hv = row["human_verdict"]
        av = row["ai_verdict"]
        if hv and av:
            matrix_counter[(hv, av)] += 1
            matrix_labels.add(hv)
            matrix_labels.add(av)

    verdict_matrix = {
        "labels": sorted(matrix_labels),
        "cells": [
            {"human_verdict": hv, "ai_verdict": av, "count": count}
            for (hv, av), count in sorted(matrix_counter.items())
        ],
    }

    ordinal_stats = {}
    for field_name in ORDINAL_FIELDS:
        dist_key = f"{field_name}_distance"
        dir_key = f"{field_name}_direction"
        scored = [row for row in rows if row[dist_key] is not None]
        dir_counts = Counter(row[dir_key] for row in scored)
        mean_distance = (
            round(sum(row[dist_key] for row in scored) / len(scored), 2)
            if scored
            else None
        )
        ordinal_stats[field_name] = {
            "field": field_name,
            "label": FIELD_LABELS[field_name],
            "sample_count": len(scored),
            "mean_absolute_distance": mean_distance,
            "match_count": dir_counts.get(AiQualityDirection.MATCH, 0),
            "overestimate_count": dir_counts.get(AiQualityDirection.OVERESTIMATE, 0),
            "underestimate_count": dir_counts.get(AiQualityDirection.UNDERESTIMATE, 0),
        }

    granularity, trunc_expr = _trend_granularity(span_days)
    bucket_rows = (
        queryset.annotate(bucket=trunc_expr)
        .values(
            "bucket",
            "verdict_agrees",
            "severity_agrees",
            "impact_agrees",
            "priority_agrees",
            "confidence_agrees",
        )
        .order_by("bucket")
    )
    bucket_stats = defaultdict(lambda: {field_name: [0, 0] for field_name in EVALUATED_FIELDS})
    for row in bucket_rows:
        bucket = row["bucket"]
        if bucket is None:
            continue
        bucket_key = bucket.isoformat()
        for field_name in EVALUATED_FIELDS:
            val = row[f"{field_name}_agrees"]
            if val is not None:
                bucket_stats[bucket_key][field_name][1] += 1
                if val is True:
                    bucket_stats[bucket_key][field_name][0] += 1

    trends = {}
    for field_name in EVALUATED_FIELDS:
        series = []
        for bucket_key in sorted(bucket_stats.keys()):
            agreed, total = bucket_stats[bucket_key][field_name]
            if total > 0:
                series.append({
                    "bucket": bucket_key,
                    "agreement_rate": _rate(agreed, total),
                    "sample_count": total,
                })
        trends[field_name] = series

    return {
        "window": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "span_days": span_days,
            "granularity": granularity,
        },
        "coverage": {
            "total_closed": total_closed,
            "evaluated": evaluated_count,
            "no_prediction": no_prediction_count,
            "invalid_prediction": invalid_prediction_count,
            "coverage_rate": _rate(evaluated_count, total_closed),
        },
        "field_agreements": field_agreements,
        "verdict_matrix": verdict_matrix,
        "ordinal_stats": ordinal_stats,
        "trends": trends,
    }


def serialize_evaluation_row(evaluation):
    """Serialize an AiQualityEvaluation record for Admin drilldown without sensitive metadata."""
    assignee = evaluation.assignee_snapshot
    assignee_name = (assignee.get_full_name() or assignee.username) if assignee else ""
    fields = {
        "verdict": {
            "ai_value": evaluation.ai_verdict,
            "human_value": evaluation.human_verdict,
            "agrees": evaluation.verdict_agrees,
            "distance": None,
            "direction": "",
        }
    }
    for field_name in ORDINAL_FIELDS:
        fields[field_name] = {
            "ai_value": getattr(evaluation, f"ai_{field_name}"),
            "human_value": getattr(evaluation, f"human_{field_name}"),
            "agrees": getattr(evaluation, f"{field_name}_agrees"),
            "distance": getattr(evaluation, f"{field_name}_distance"),
            "direction": getattr(evaluation, f"{field_name}_direction"),
        }

    return {
        "id": str(evaluation.id),
        "case_id": str(evaluation.case_id),
        "case_readable_id": evaluation.case.case_id,
        "case_title": evaluation.case.title,
        "closed_at": evaluation.closed_at.isoformat(),
        "evaluated_at": evaluation.evaluated_at.isoformat(),
        "category_snapshot": evaluation.category_snapshot,
        "assignee_id": evaluation.assignee_snapshot_id,
        "assignee_name": assignee_name,
        "human_severity": evaluation.human_severity,
        "coverage_state": evaluation.coverage_state,
        "fields": fields,
    }
