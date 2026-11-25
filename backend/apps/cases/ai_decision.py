import json

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.audit.context import audit_actor
from apps.comments.models import Comment

AI_ASSESSMENT_FIELD_PAIRS = {
    "verdict": "verdict_ai",
    "severity": "severity_ai",
    "impact": "impact_ai",
    "priority": "priority_ai",
    "confidence": "confidence_ai",
}


def extract_report_digest(case):
    """Safely extract the prose digest from case.investigation_report_ai_json."""
    raw = getattr(case, "investigation_report_ai_json", "")
    if not raw:
        return ""
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        return ""
    if not isinstance(parsed, dict):
        return ""
    report = parsed.get("report")
    if not isinstance(report, dict):
        return ""
    return str(report.get("digest") or "").strip()


@transaction.atomic
def apply_ai_assessment(
    case,
    *,
    fields=None,
    apply_digest_to_summary=False,
    decision_note="",
    actor=None,
):
    """Copy AI-assessed Case fields into analyst decision fields with full audit trail."""
    locked_case = type(case).objects.select_for_update().get(pk=case.pk)

    if fields is None:
        target_fields = [
            human_field
            for human_field, ai_field in AI_ASSESSMENT_FIELD_PAIRS.items()
            if getattr(locked_case, ai_field, "")
        ]
    else:
        invalid = [field for field in fields if field not in AI_ASSESSMENT_FIELD_PAIRS]
        if invalid:
            raise ValidationError({"fields": [f"Unsupported AI assessment field(s): {', '.join(invalid)}"]})
        target_fields = list(dict.fromkeys(fields))

    updated_fields = []
    for human_field in target_fields:
        ai_field = AI_ASSESSMENT_FIELD_PAIRS[human_field]
        ai_value = (getattr(locked_case, ai_field, "") or "").strip()
        if not ai_value:
            if fields is not None:
                raise ValidationError({"fields": [f"Case has no AI prediction for '{human_field}'."]})
            continue
        if getattr(locked_case, human_field, "") != ai_value:
            setattr(locked_case, human_field, ai_value)
        updated_fields.append(human_field)

    if apply_digest_to_summary:
        digest = extract_report_digest(locked_case)
        if digest:
            locked_case.summary = digest
            updated_fields.append("summary")

    if not updated_fields:
        raise ValidationError({"detail": "No AI assessment values are available to apply."})

    with audit_actor(actor):
        locked_case.full_clean()
        locked_case.save(update_fields=[*dict.fromkeys(updated_fields), "updated_at"])

        note_text = str(decision_note or "").strip()
        if note_text:
            Comment.objects.create(
                content_type=ContentType.objects.get_for_model(type(locked_case)),
                object_id=str(locked_case.pk),
                author=actor if getattr(actor, "is_authenticated", False) else None,
                body=f"[AI Decision] {note_text}",
            )

    return locked_case, list(dict.fromkeys(updated_fields))
