import json
import time
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings
from langchain_core.messages import SystemMessage, HumanMessage

from apps.settings.runtime_config import get_prompt_language
from integrations.llm.llmapi import LLMAPI

INVESTIGATION_SYSTEM_PROMPT = "investigation.system"
INVESTIGATION_KNOWLEDGE_KEYWORD_PROMPT = "investigation.knowledge_keywords"
KNOWLEDGE_EXTRACTION_PROMPT = "knowledge_extraction.system"

ANALYSIS_SYSTEM_PROMPT_PATH = ("investigation", "System")
KNOWLEDGE_KEYWORD_PROMPT_PATH = ("investigation", "KnowledgeKeywords")
KNOWLEDGE_EXTRACTION_PROMPT_PATH = ("knowledge_extraction", "System")


@dataclass(frozen=True)
class PromptSpec:
    directory: str
    name: str


PROMPT_CATALOG = {
    INVESTIGATION_SYSTEM_PROMPT: PromptSpec(*ANALYSIS_SYSTEM_PROMPT_PATH),
    INVESTIGATION_KNOWLEDGE_KEYWORD_PROMPT: PromptSpec(*KNOWLEDGE_KEYWORD_PROMPT_PATH),
    KNOWLEDGE_EXTRACTION_PROMPT: PromptSpec(*KNOWLEDGE_EXTRACTION_PROMPT_PATH),
}


def _prompt_file_path(spec, *, language=None):
    prompt_language = language or get_prompt_language()
    filename = f"{spec.name}_{prompt_language}.md"
    return Path(settings.BASE_DIR) / "data" / "playbooks" / spec.directory / filename


def _prompt_spec(prompt_id):
    try:
        return PROMPT_CATALOG[prompt_id]
    except KeyError:
        raise KeyError(f"Unknown agentic prompt id: {prompt_id}") from None


def read_prompt(prompt_id, *, language=None):
    spec = _prompt_spec(prompt_id)
    return _prompt_file_path(spec, language=language).read_text(encoding="utf-8")


def list_prompt_catalog(*, language=None):
    """List built-in and custom prompt templates for the Agent Monitor inspector."""
    resolved_language = language or get_prompt_language()
    items = []

    for prompt_id, spec in PROMPT_CATALOG.items():
        path = _prompt_file_path(spec, language=resolved_language)
        if not path.exists():
            continue
        content = path.read_text(encoding="utf-8")
        items.append({
            "prompt_id": prompt_id,
            "source": "builtin",
            "directory": spec.directory,
            "name": spec.name,
            "language": resolved_language,
            "line_count": len(content.splitlines()),
            "content": content,
        })

    custom_playbooks_dir = Path(settings.CUSTOM_DIR) / "data" / "playbooks"
    if custom_playbooks_dir.exists():
        suffix = f"_{resolved_language}.md"
        for path in sorted(custom_playbooks_dir.rglob(f"*{suffix}")):
            content = path.read_text(encoding="utf-8")
            slug = path.parent.name
            name = path.name[: -len(suffix)]
            items.append({
                "prompt_id": f"custom.{slug}.{name.lower()}",
                "source": "custom",
                "directory": slug,
                "name": name,
                "language": resolved_language,
                "line_count": len(content.splitlines()),
                "content": content,
            })

    return items


STRUCTURED_OUTPUT_MODEL_TAG = "structured_output"


def _int_or_none(value):
    try:
        return max(0, int(value)) if value is not None else None
    except (TypeError, ValueError):
        return None


def _extract_token_usage(raw_message):
    if raw_message is None:
        return {}
    usage = getattr(raw_message, "usage_metadata", None)
    if not isinstance(usage, dict):
        response_meta = getattr(raw_message, "response_metadata", None)
        usage = response_meta.get("token_usage") if isinstance(response_meta, dict) else None
    if not isinstance(usage, dict):
        return {}
    input_tokens = _int_or_none(usage.get("input_tokens") or usage.get("prompt_tokens"))
    output_tokens = _int_or_none(usage.get("output_tokens") or usage.get("completion_tokens"))
    total_tokens = _int_or_none(usage.get("total_tokens"))
    if total_tokens is None and input_tokens is not None and output_tokens is not None:
        total_tokens = input_tokens + output_tokens
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }


def invoke_structured_llm_with_telemetry(
    *,
    prompt_id,
    payload,
    output_schema,
    model_tag=STRUCTURED_OUTPUT_MODEL_TAG,
):
    """Invoke a structured LLM chain and capture model, latency, and token usage telemetry."""
    llm_api = LLMAPI()
    telemetry = llm_api.resolve_config_metadata(tag=model_tag)
    base_model = llm_api.get_model(tag=model_tag)
    messages = [
        SystemMessage(content=read_prompt(prompt_id)),
        HumanMessage(content=json.dumps(payload, ensure_ascii=False)),
    ]

    started = time.monotonic()
    raw_message = None
    try:
        structured = base_model.with_structured_output(output_schema, include_raw=True)
        response = structured.invoke(messages)
        if isinstance(response, dict) and "parsed" in response:
            raw_message = response.get("raw")
            parsed = response.get("parsed")
            parsing_error = response.get("parsing_error")
            if parsed is None and parsing_error is not None:
                raise parsing_error
        else:
            parsed = response
    except TypeError:
        structured = base_model.with_structured_output(output_schema)
        parsed = structured.invoke(messages)

    telemetry["latency_ms"] = max(0, int((time.monotonic() - started) * 1000))
    telemetry.update(_extract_token_usage(raw_message))
    return parsed, telemetry


def invoke_structured_llm(*, prompt_id, payload, output_schema, model_tag=STRUCTURED_OUTPUT_MODEL_TAG):
    parsed, _telemetry = invoke_structured_llm_with_telemetry(
        prompt_id=prompt_id,
        payload=payload,
        output_schema=output_schema,
        model_tag=model_tag,
    )
    return parsed
