from uuid import UUID

from django.db.models import Count, DateTimeField, IntegerField, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin, IsBusinessWriterOrReadOnly
from apps.agentic.services.cases import request_case_analysis
from apps.alerts.models import Alert
from apps.audit.context import audit_actor
from apps.audit.mixins import AuditActorMixin
from apps.common.advanced_filters import AdvancedFilterBackend
from apps.common.pagination import StandardResultsSetPagination
from apps.enrichments.models import Enrichment
from apps.playbooks.models import Playbook
from .ai_decision import apply_ai_assessment
from .ai_quality import (
    build_ai_quality_summary,
    filter_evaluations,
    get_case_ai_quality_payload,
    serialize_evaluation_row,
)
from .models import Case, CaseRelationship
from .serializers import CaseDetailSerializer, CaseListSerializer, CaseRelationshipSerializer
from .services import suggest_related_cases


class CaseViewSet(AuditActorMixin, viewsets.ModelViewSet):
    queryset = Case.objects.select_related("assignee").order_by("-created_at")
    serializer_class = CaseDetailSerializer
    permission_classes = [permissions.IsAuthenticated, IsBusinessWriterOrReadOnly]
    lookup_field = "id"
    filter_backends = (DjangoFilterBackend, SearchFilter, OrderingFilter, AdvancedFilterBackend)
    search_fields = ("case_id", "title", "description", "summary", "correlation_uid")
    ordering_fields = (
        "created_at",
        "updated_at",
        "acknowledged_time",
        "closed_time",
        "severity",
        "severity_ai",
        "priority",
        "priority_ai",
        "status",
        "confidence",
        "confidence_ai",
        "impact",
        "impact_ai",
        "verdict",
        "verdict_ai",
    )
    filterset_fields = (
        "status",
        "severity",
        "priority",
        "category",
        "confidence",
        "impact",
        "verdict",
        "assignee",
    )
    advanced_filter_fields = {
        "case_id": "text",
        "title": "text",
        "status": "select",
        "category": "select",
        "severity": "select",
        "assignee": "user",
        "verdict": "select",
        "priority": "select",
        "confidence": "select",
        "impact": "select",
        "tags": "tag",
        "acknowledged_time": "date",
        "closed_time": "date",
        "created_at": "date",
        "updated_at": "date",
        "description": "text",
        "summary": "text",
        "correlation_uid": "text",
    }

    def annotate_list_metrics(self, queryset):
        alert_count = (
            Alert.objects
            .filter(case_id=OuterRef("pk"))
            .order_by()
            .values("case_id")
            .annotate(count=Count("id"))
            .values("count")[:1]
        )
        playbook_count = (
            Playbook.objects
            .filter(case_id=OuterRef("pk"))
            .order_by()
            .values("case_id")
            .annotate(count=Count("id"))
            .values("count")[:1]
        )
        first_alert_seen_time = (
            Alert.objects
            .filter(case_id=OuterRef("pk"), first_seen_time__isnull=False)
            .order_by("first_seen_time")
            .values("first_seen_time")[:1]
        )
        enrichment_count = (
            Enrichment.objects
            .filter(case_id=OuterRef("pk"))
            .order_by()
            .values("case_id")
            .annotate(count=Count("id"))
            .values("count")[:1]
        )
        outgoing_relationship_count = (
            CaseRelationship.objects
            .filter(source_case_id=OuterRef("pk"))
            .order_by()
            .values("source_case_id")
            .annotate(count=Count("id"))
            .values("count")[:1]
        )
        incoming_relationship_count = (
            CaseRelationship.objects
            .filter(target_case_id=OuterRef("pk"))
            .order_by()
            .values("target_case_id")
            .annotate(count=Count("id"))
            .values("count")[:1]
        )
        return queryset.annotate(
            alert_count=Coalesce(Subquery(alert_count, output_field=IntegerField()), Value(0)),
            playbook_count=Coalesce(Subquery(playbook_count, output_field=IntegerField()), Value(0)),
            enrichment_count=Coalesce(Subquery(enrichment_count, output_field=IntegerField()), Value(0)),
            first_alert_seen_time=Subquery(first_alert_seen_time, output_field=DateTimeField()),
            relationship_count=(
                Coalesce(Subquery(outgoing_relationship_count, output_field=IntegerField()), Value(0))
                + Coalesce(Subquery(incoming_relationship_count, output_field=IntegerField()), Value(0))
            ),
        )

    def annotate_detail_metrics(self, queryset):
        first_alert_seen_time = (
            Alert.objects
            .filter(case_id=OuterRef("pk"), first_seen_time__isnull=False)
            .order_by("first_seen_time")
            .values("first_seen_time")[:1]
        )
        outgoing_relationship_count = (
            CaseRelationship.objects
            .filter(source_case_id=OuterRef("pk"))
            .order_by()
            .values("source_case_id")
            .annotate(count=Count("id"))
            .values("count")[:1]
        )
        incoming_relationship_count = (
            CaseRelationship.objects
            .filter(target_case_id=OuterRef("pk"))
            .order_by()
            .values("target_case_id")
            .annotate(count=Count("id"))
            .values("count")[:1]
        )
        return queryset.annotate(
            first_alert_seen_time=Subquery(first_alert_seen_time, output_field=DateTimeField()),
            relationship_count=(
                Coalesce(Subquery(outgoing_relationship_count, output_field=IntegerField()), Value(0))
                + Coalesce(Subquery(incoming_relationship_count, output_field=IntegerField()), Value(0))
            ),
        )

    def get_queryset(self):
        if self.action == "list":
            return self.annotate_list_metrics(super().get_queryset()).defer("investigation_report_ai_json")
        if self.action in {"retrieve", "update", "partial_update"}:
            return self.annotate_detail_metrics(super().get_queryset()).defer("investigation_report_ai_json")
        return super().get_queryset()

    def get_serializer_class(self):
        if self.action == "list":
            return CaseListSerializer
        return CaseDetailSerializer

    @action(detail=True, methods=["get", "patch"], url_path="investigation")
    def investigation(self, request, *args, **kwargs):
        case = self.get_object()
        if request.method == "PATCH":
            value = request.data.get("investigation_report_ai_json", "")
            with audit_actor(request.user):
                case.investigation_report_ai_json = value
                case.save(update_fields=["investigation_report_ai_json", "updated_at"])
        return Response({
            "id": str(case.id),
            "case_id": case.case_id,
            "investigation_report_ai_json": case.investigation_report_ai_json,
        })

    @action(detail=True, methods=["post"], url_path="apply-ai-assessment")
    def apply_ai(self, request, *args, **kwargs):
        case = self.get_object()
        raw_fields = request.data.get("fields", None)
        if raw_fields is not None and not isinstance(raw_fields, list):
            raise ValidationError({"fields": ["fields must be a list of assessment field names."]})

        updated_case, applied_fields = apply_ai_assessment(
            case,
            fields=raw_fields,
            apply_digest_to_summary=bool(request.data.get("apply_digest_to_summary", False)),
            decision_note=request.data.get("decision_note", ""),
            actor=request.user,
        )
        refreshed = (
            self.annotate_detail_metrics(Case.objects.select_related("assignee"))
            .defer("investigation_report_ai_json")
            .get(pk=updated_case.pk)
        )
        return Response({
            "case": CaseDetailSerializer(refreshed, context={"request": request}).data,
            "applied_fields": applied_fields,
        })

    @action(detail=True, methods=["post"], url_path="analyze")
    def analyze(self, request, *args, **kwargs):
        case = self.get_object()
        job = request_case_analysis(case=case, trigger="manual")
        return Response(
            {
                "id": str(job.id),
                "case_id": case.case_id,
                "status": job.status,
                "trigger": job.trigger,
                "scheduled_at": job.scheduled_at.isoformat(),
            },
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=["get"], url_path="ai-quality")
    def ai_quality(self, request, *args, **kwargs):
        case = self.get_object()
        return Response(get_case_ai_quality_payload(case))


class CaseRelationshipViewSet(AuditActorMixin, viewsets.ModelViewSet):
    queryset = CaseRelationship.objects.select_related(
        "source_case__assignee",
        "target_case__assignee",
        "created_by",
    ).order_by("-created_at")
    serializer_class = CaseRelationshipSerializer
    permission_classes = [permissions.IsAuthenticated, IsBusinessWriterOrReadOnly]
    filter_backends = (DjangoFilterBackend, SearchFilter, OrderingFilter)
    filterset_fields = ("relationship_type",)
    search_fields = (
        "source_case__case_id",
        "source_case__title",
        "target_case__case_id",
        "target_case__title",
        "note",
        "created_by__username",
    )
    ordering_fields = ("relationship_type", "created_at", "updated_at")

    def get_queryset(self):
        queryset = super().get_queryset()
        case_id = self.request.query_params.get("case")
        if case_id:
            try:
                case_id = UUID(case_id)
            except (TypeError, ValueError):
                raise ValidationError({"case": ["Invalid Case ID."]})
            queryset = queryset.filter(Q(source_case_id=case_id) | Q(target_case_id=case_id))
        return queryset

    @action(detail=False, methods=["get"], url_path="suggestions")
    def suggestions(self, request):
        case_id = request.query_params.get("case")
        if not case_id:
            raise ValidationError({"case": ["This query parameter is required."]})
        try:
            case = Case.objects.get(pk=UUID(case_id))
        except (Case.DoesNotExist, TypeError, ValueError):
            raise ValidationError({"case": ["Case not found."]})
        return Response({"results": suggest_related_cases(case)})


class AiQualitySummaryView(APIView):
    """Admin-only global AI-Human agreement summary endpoint."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(build_ai_quality_summary(request.query_params))


class AiQualityEvaluationListView(APIView):
    """Admin-only paginated drilldown endpoint for closed-Case AI quality evaluations."""

    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        queryset, _start, _end, _span_days = filter_evaluations(request.query_params)
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        items = page if page is not None else queryset
        data = [serialize_evaluation_row(item) for item in items]
        if page is not None:
            return paginator.get_paginated_response(data)
        return Response({"results": data})
