from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    AiQualityEvaluationListView,
    AiQualitySummaryView,
    CaseRelationshipViewSet,
    CaseViewSet,
)

router = DefaultRouter()
router.register("cases", CaseViewSet, basename="case")
router.register("case-relationships", CaseRelationshipViewSet, basename="case-relationship")

urlpatterns = [
    path("", include(router.urls)),
    path("ai-quality/summary/", AiQualitySummaryView.as_view(), name="ai-quality-summary"),
    path("ai-quality/evaluations/", AiQualityEvaluationListView.as_view(), name="ai-quality-evaluations"),
]
