import json
import os
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings
from django.db import transaction
from dotenv import load_dotenv

from .models import LLMProviderConfig
from .runtime_config import invalidate

DEFAULT_ENV_TAGS = ("structured_output", "fast", "powerful")


@dataclass(frozen=True)
class EnvLLMProviderSpec:
    """Declarative specification mapping environment variables to an OpenAI-compatible provider."""

    slug: str
    priority: int
    api_key_vars: tuple[str, ...]
    base_url_vars: tuple[str, ...]
    default_base_url: str
    model_vars: tuple[str, ...]
    models_vars: tuple[str, ...]
    default_model: str
    tags_vars: tuple[str, ...]
    proxy_vars: tuple[str, ...]
    default_tags: tuple[str, ...] = DEFAULT_ENV_TAGS
    requires_api_key: bool = True
    default_api_key: str = ""


ENV_LLM_PROVIDER_SPECS = (
    EnvLLMProviderSpec(
        slug="gemini",
        priority=50,
        api_key_vars=("GEMINI_API_KEY", "API_KEY_GEMINI", "GOOGLE_API_KEY", "API_KEY_GOOGLE", "GOOGLE_GEMINI_API_KEY"),
        base_url_vars=("GEMINI_BASE_URL", "GOOGLE_GEMINI_BASE_URL", "ASP_GEMINI_BASE_URL"),
        default_base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        model_vars=("GEMINI_MODEL", "GOOGLE_MODEL", "ASP_GEMINI_MODEL"),
        models_vars=("GEMINI_MODELS", "ASP_GEMINI_MODELS"),
        default_model="gemini-flash-latest",
        tags_vars=("GEMINI_TAGS", "ASP_GEMINI_TAGS"),
        proxy_vars=("GEMINI_PROXY", "ASP_LLM_PROXY"),
    ),
    EnvLLMProviderSpec(
        slug="openai",
        priority=60,
        api_key_vars=("OPENAI_API_KEY", "API_KEY_OPENAI"),
        base_url_vars=("OPENAI_BASE_URL",),
        default_base_url="https://api.openai.com/v1",
        model_vars=("OPENAI_MODEL",),
        models_vars=("OPENAI_MODELS",),
        default_model="gpt-4o-mini",
        tags_vars=("OPENAI_TAGS",),
        proxy_vars=("OPENAI_PROXY", "ASP_LLM_PROXY"),
    ),
    EnvLLMProviderSpec(
        slug="openrouter",
        priority=70,
        api_key_vars=("OPENROUTER_API_KEY", "API_KEY_OPENROUTER"),
        base_url_vars=("OPENROUTER_BASE_URL",),
        default_base_url="https://openrouter.ai/api/v1",
        model_vars=("OPENROUTER_MODEL",),
        models_vars=("OPENROUTER_MODELS",),
        default_model="openai/gpt-4o-mini",
        tags_vars=("OPENROUTER_TAGS",),
        proxy_vars=("OPENROUTER_PROXY", "ASP_LLM_PROXY"),
    ),
    EnvLLMProviderSpec(
        slug="deepseek",
        priority=80,
        api_key_vars=("DEEPSEEK_API_KEY", "API_KEY_DEEPSEEK"),
        base_url_vars=("DEEPSEEK_BASE_URL",),
        default_base_url="https://api.deepseek.com/v1",
        model_vars=("DEEPSEEK_MODEL",),
        models_vars=("DEEPSEEK_MODELS",),
        default_model="deepseek-chat",
        tags_vars=("DEEPSEEK_TAGS",),
        proxy_vars=("DEEPSEEK_PROXY", "ASP_LLM_PROXY"),
    ),
    EnvLLMProviderSpec(
        slug="groq",
        priority=90,
        api_key_vars=("GROQ_API_KEY", "API_KEY_GROQ"),
        base_url_vars=("GROQ_BASE_URL",),
        default_base_url="https://api.groq.com/openai/v1",
        model_vars=("GROQ_MODEL",),
        models_vars=("GROQ_MODELS",),
        default_model="llama-3.3-70b-versatile",
        tags_vars=("GROQ_TAGS",),
        proxy_vars=("GROQ_PROXY", "ASP_LLM_PROXY"),
    ),
    EnvLLMProviderSpec(
        slug="ollama",
        priority=95,
        api_key_vars=("OLLAMA_API_KEY",),
        base_url_vars=("OLLAMA_BASE_URL",),
        default_base_url="",
        model_vars=("OLLAMA_MODEL",),
        models_vars=("OLLAMA_MODELS",),
        default_model="llama3.1",
        tags_vars=("OLLAMA_TAGS",),
        proxy_vars=("OLLAMA_PROXY", "ASP_LLM_PROXY"),
        requires_api_key=False,
        default_api_key="ollama",
    ),
)


def _first_env(environ, keys):
    for key in keys:
        value = str(environ.get(key) or "").strip()
        if value:
            return value
    return ""


def _parse_tags(raw_tags, default_tags=DEFAULT_ENV_TAGS):
    if isinstance(raw_tags, list):
        candidates = raw_tags
    else:
        candidates = str(raw_tags or "").split(",")

    tags = []
    for item in candidates:
        tag = str(item).strip()
        if tag and tag not in tags:
            tags.append(tag)
    return tags or list(default_tags)


def _split_csv(raw_value):
    values = []
    for item in str(raw_value or "").split(","):
        cleaned = item.strip()
        if cleaned and cleaned not in values:
            values.append(cleaned)
    return values


def _parse_models(spec, environ):
    multi = _first_env(environ, spec.models_vars)
    if multi:
        return _split_csv(multi)
    single = _first_env(environ, spec.model_vars)
    return [single or spec.default_model]


def _collect_preset_specs(environ):
    entries = []
    for spec in ENV_LLM_PROVIDER_SPECS:
        api_key = _first_env(environ, spec.api_key_vars)
        base_url = (_first_env(environ, spec.base_url_vars) or spec.default_base_url).rstrip("/")
        if spec.requires_api_key and not api_key:
            continue
        if not base_url:
            continue
        if not spec.requires_api_key and not api_key:
            api_key = spec.default_api_key

        proxy = _first_env(environ, spec.proxy_vars)
        tags = _parse_tags(_first_env(environ, spec.tags_vars), spec.default_tags)
        models = _parse_models(spec, environ)
        for index, model in enumerate(models, start=1):
            name = f"env:{spec.slug}" if index == 1 else f"env:{spec.slug}:{index}"
            entries.append({
                "name": name,
                "base_url": base_url,
                "model": model,
                "api_key": api_key,
                "proxy": proxy,
                "tags": tags,
                "enabled": True,
                "priority": spec.priority + (index - 1),
            })
    return entries


def _collect_custom_specs(environ):
    base_url = _first_env(environ, ("ASP_LLM_BASE_URL",)).rstrip("/")
    api_key = _first_env(environ, ("ASP_LLM_API_KEY",))
    models_raw = _first_env(environ, ("ASP_LLM_MODELS",)) or _first_env(environ, ("ASP_LLM_MODEL",))
    if not base_url or not models_raw:
        return []

    base_name = _first_env(environ, ("ASP_LLM_NAME",)) or "env:custom"
    tags = _parse_tags(_first_env(environ, ("ASP_LLM_TAGS",)))
    proxy = _first_env(environ, ("ASP_LLM_PROXY",))
    models = _split_csv(models_raw)
    entries = []
    for index, model in enumerate(models, start=1):
        name = base_name if index == 1 else f"{base_name}:{index}"
        entries.append({
            "name": name[:100],
            "base_url": base_url,
            "model": model,
            "api_key": api_key,
            "proxy": proxy,
            "tags": tags,
            "enabled": True,
            "priority": 40 + (index - 1),
        })
    return entries


def _collect_json_specs(environ):
    raw_json = _first_env(environ, ("ASP_LLM_PROVIDERS_JSON",))
    if not raw_json:
        return []
    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ValueError("ASP_LLM_PROVIDERS_JSON must be valid JSON.") from exc
    if not isinstance(parsed, list):
        raise ValueError("ASP_LLM_PROVIDERS_JSON must decode to a JSON array.")

    entries = []
    for index, item in enumerate(parsed, start=1):
        if not isinstance(item, dict):
            raise ValueError("Each item in ASP_LLM_PROVIDERS_JSON must be an object.")
        name = str(item.get("name") or f"env:json:{index}").strip()[:100]
        base_url = str(item.get("base_url") or "").strip().rstrip("/")
        model = str(item.get("model") or "").strip()
        if not name or not base_url or not model:
            raise ValueError("Items in ASP_LLM_PROVIDERS_JSON require name, base_url, and model.")
        entries.append({
            "name": name,
            "base_url": base_url,
            "model": model,
            "api_key": str(item.get("api_key") or "").strip(),
            "proxy": str(item.get("proxy") or "").strip(),
            "tags": _parse_tags(item.get("tags")),
            "enabled": bool(item.get("enabled", True)),
            "priority": max(0, int(item.get("priority", 45 + index - 1))),
        })
    return entries


def collect_env_llm_specs(environ=None):
    """Collect normalized LLM provider specs from environment variables without exposing secrets."""
    source = os.environ if environ is None else environ
    merged = {}
    for entry in (
        *_collect_preset_specs(source),
        *_collect_custom_specs(source),
        *_collect_json_specs(source),
    ):
        merged[entry["name"]] = entry
    return list(merged.values())


def load_project_dotenv_files():
    """Load optional backend and repo-root .env files without overriding container env vars."""
    base_dir = Path(settings.BASE_DIR)
    for candidate in (base_dir / ".env", base_dir.parent / ".env"):
        if candidate.is_file():
            load_dotenv(candidate, override=False)


def _sync_single_provider(spec, *, dry_run):
    existing = LLMProviderConfig.objects.filter(name=spec["name"]).first()
    fields = ("base_url", "model", "api_key", "proxy", "tags", "enabled", "priority")
    if existing is None:
        action = "created"
        if not dry_run:
            LLMProviderConfig.objects.create(**spec)
    else:
        changed = any(getattr(existing, field) != spec[field] for field in fields)
        action = "updated" if changed else "unchanged"
        if changed and not dry_run:
            for field in fields:
                setattr(existing, field, spec[field])
            existing.save(update_fields=[*fields, "updated_at"])

    return {
        "name": spec["name"],
        "model": spec["model"],
        "base_url": spec["base_url"],
        "tags": list(spec["tags"]),
        "enabled": spec["enabled"],
        "priority": spec["priority"],
        "action": action,
    }


def sync_llm_providers_from_env(environ=None, *, dry_run=False):
    """Upsert LLMProviderConfig rows from environment variables and return secret-free summaries."""
    specs = collect_env_llm_specs(environ=environ)
    if not specs:
        return []

    if dry_run:
        return [_sync_single_provider(spec, dry_run=True) for spec in specs]

    with transaction.atomic():
        results = [_sync_single_provider(spec, dry_run=False) for spec in specs]
    invalidate("llm")
    return results
