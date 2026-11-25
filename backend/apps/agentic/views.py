from uuid import UUID

from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from apps.agentic.analysis.prompts import list_prompt_catalog
from apps.agentic.models import CaseAnalysisJob
from apps.agentic.services.agent_monitor import (
    build_agentic_overview,
    serialize_job_detail,
    serialize_job_list_item,
)
from apps.agentic.services.cases import (
    cancel_case_analysis_job,
    request_case_analysis,
    retry_case_analysis_job,
)
from apps.cases.models import Case
from apps.common.pagination import StandardResultsSetPagination


def _resolve_case_by_identifier(identifier):
    raw = str(identifier or "").strip()
    if not raw:
        raise ValidationError({"case_id": ["Case ID is required."]})
    try:
        uuid_value = UUID(raw)
        case = Case.objects.filter(pk=uuid_value).first()
    except (TypeError, ValueError):
        case = Case.objects.filter(case_id__iexact=raw).first()
    if case is None:
        raise ValidationError({"case_id": [f"Case '{raw}' was not found."]})
    return case


class AgenticOverviewView(APIView):
    """Admin-only overview endpoint for Agent Monitor KPIs, RAG stats, and runtime catalog."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(build_agentic_overview())


class AgenticPromptCatalogView(APIView):
    """Admin-only read-only endpoint listing built-in and custom agent prompts."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        language = (request.query_params.get("language") or "").strip() or None
        return Response({"results": list_prompt_catalog(language=language)})


class CaseAnalysisJobViewSet(viewsets.ReadOnlyModelViewSet):
    """Admin-only CaseAnalysisJob queue inspection and control endpoints."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    pagination_class = StandardResultsSetPagination
    lookup_field = "id"
    filter_backends = (DjangoFilterBackend, SearchFilter, OrderingFilter)
    filterset_fields = ("status", "trigger", "model_name", "case")
    search_fields = ("case__case_id", "case__title", "provider_name", "model_name", "trigger", "error")
    ordering_fields = ("scheduled_at", "created_at", "started_at", "completed_at", "latency_ms", "total_tokens")
    ordering = ("-created_at",)

    def get_queryset(self):
        return CaseAnalysisJob.objects.select_related("case").order_by("-created_at")

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        items = page if page is not None else queryset
        data = [serialize_job_list_item(item) for item in items]
        if page is not None:
            return self.get_paginated_response(data)
        return Response({"results": data})

    def retrieve(self, request, *args, **kwargs):
        job = self.get_object()
        return Response(serialize_job_detail(job))

    @action(detail=True, methods=["post"], url_path="retry")
    def retry(self, request, *args, **kwargs):
        job = self.get_object()
        try:
            queued = retry_case_analysis_job(job, trigger="manual_retry")
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serialize_job_list_item(queued), status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, *args, **kwargs):
        job = self.get_object()
        try:
            cancelled = cancel_case_analysis_job(job)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(serialize_job_list_item(cancelled))

    @action(detail=False, methods=["post"], url_path="trigger")
    def trigger(self, request):
        case = _resolve_case_by_identifier(request.data.get("case_id"))
        job = request_case_analysis(case=case, trigger="agent_monitor")
        return Response(serialize_job_list_item(job), status=status.HTTP_202_ACCEPTED)
