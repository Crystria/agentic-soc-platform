from django.core.management.base import BaseCommand

from apps.cases.ai_quality import sync_case_ai_quality_evaluation
from apps.cases.models import AiQualityEvaluation, Case, CaseStatus


class Command(BaseCommand):
    help = "Backfill and reconcile AiQualityEvaluation records for Closed Cases without invoking LLMs."

    def handle(self, *args, **options):
        stale_deleted, _ = AiQualityEvaluation.objects.exclude(
            case__status=CaseStatus.CLOSED,
        ).delete()
        missing_closed_deleted, _ = AiQualityEvaluation.objects.filter(
            case__closed_time__isnull=True,
        ).delete()

        rebuilt = 0
        closed_ids = Case.objects.filter(
            status=CaseStatus.CLOSED,
            closed_time__isnull=False,
        ).values_list("id", flat=True)
        for case_id in closed_ids.iterator(chunk_size=200):
            sync_case_ai_quality_evaluation(case_id)
            rebuilt += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Rebuilt {rebuilt} AI quality evaluation(s); removed {stale_deleted + missing_closed_deleted} stale evaluation(s)."
            )
        )
