from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .ai_quality import safe_sync_case_ai_quality_evaluation
from .models import Case


@receiver(post_save, sender=Case)
def sync_ai_quality_on_case_save(sender, instance, **kwargs):
    """Synchronize AiQualityEvaluation after Case closure, closed edits, or reopen."""
    case_id = instance.pk
    transaction.on_commit(lambda: safe_sync_case_ai_quality_evaluation(case_id))
