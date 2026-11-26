from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Knowledge
from .vector_store import (
    KNOWLEDGE_INDEX_SKIP_UPDATE_FIELDS,
    safe_delete_knowledge_index,
    safe_sync_knowledge_index,
)


@receiver(post_save, sender=Knowledge)
def sync_knowledge_vector_on_save(sender, instance, raw=False, update_fields=None, **kwargs):
    if raw:
        return
    if update_fields and set(update_fields).issubset(KNOWLEDGE_INDEX_SKIP_UPDATE_FIELDS):
        return
    knowledge_pk = instance.pk
    transaction.on_commit(lambda: safe_sync_knowledge_index(knowledge_pk))


@receiver(post_delete, sender=Knowledge)
def delete_knowledge_vector_on_delete(sender, instance, **kwargs):
    knowledge_pk = str(instance.pk)
    transaction.on_commit(lambda: safe_delete_knowledge_index(knowledge_pk))
