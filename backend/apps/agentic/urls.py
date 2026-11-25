from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AgenticOverviewView,
    AgenticPromptCatalogView,
    CaseAnalysisJobViewSet,
)

router = DefaultRouter()
router.register("agentic/jobs", CaseAnalysisJobViewSet, basename="agentic-job")

urlpatterns = [
    path("", include(router.urls)),
    path("agentic/overview/", AgenticOverviewView.as_view(), name="agentic-overview"),
    path("agentic/prompts/", AgenticPromptCatalogView.as_view(), name="agentic-prompts"),
]
