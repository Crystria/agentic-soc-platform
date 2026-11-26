import logging
import os

from langchain_openai import OpenAIEmbeddings

from integrations.llm.llmapi import _http_client_kwargs

logger = logging.getLogger(__name__)

EMBEDDING_MODEL_TAG = "embedding"

DEFAULT_GEMINI_EMBEDDING_MODEL = "gemini-embedding-001"
DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
DEFAULT_OPENROUTER_EMBEDDING_MODEL = "openai/text-embedding-3-small"
DEFAULT_OLLAMA_EMBEDDING_MODEL = "nomic-embed-text"


def _first_env(*names):
    for name in names:
        value = str(os.environ.get(name) or "").strip()
        if value:
            return value
    return ""


def _parse_dimensions():
    raw = _first_env("ASP_EMBEDDING_DIMENSIONS", "EMBEDDING_DIMENSIONS")
    if not raw:
        return None
    try:
        parsed = int(raw)
        return parsed if parsed > 0 else None
    except ValueError:
        logger.warning("Ignoring invalid embedding dimensions value: %s", raw)
        return None


def _infer_embedding_model(base_url):
    lowered = (base_url or "").lower()
    if "generativelanguage.googleapis.com" in lowered:
        return _first_env("ASP_EMBEDDING_MODEL", "GEMINI_EMBEDDING_MODEL") or DEFAULT_GEMINI_EMBEDDING_MODEL
    if "openrouter.ai" in lowered:
        return _first_env("ASP_EMBEDDING_MODEL", "OPENROUTER_EMBEDDING_MODEL") or DEFAULT_OPENROUTER_EMBEDDING_MODEL
    if "11434" in lowered or "ollama" in lowered:
        return _first_env("ASP_EMBEDDING_MODEL", "OLLAMA_EMBEDDING_MODEL") or DEFAULT_OLLAMA_EMBEDDING_MODEL
    if "api.openai.com" in lowered:
        return _first_env("ASP_EMBEDDING_MODEL", "OPENAI_EMBEDDING_MODEL") or DEFAULT_OPENAI_EMBEDDING_MODEL
    return _first_env("ASP_EMBEDDING_MODEL")


def _supports_inferred_embeddings(base_url):
    lowered = (base_url or "").lower()
    return any(
        token in lowered
        for token in (
            "generativelanguage.googleapis.com",
            "api.openai.com",
            "openrouter.ai",
            "11434",
            "ollama",
        )
    )


def _explicit_env_embedding_config():
    base_url = _first_env("ASP_EMBEDDING_BASE_URL", "EMBEDDING_BASE_URL").rstrip("/")
    api_key = _first_env("ASP_EMBEDDING_API_KEY", "EMBEDDING_API_KEY", "API_KEY_GEMINI", "GEMINI_API_KEY", "OPENAI_API_KEY")
    model = _first_env("ASP_EMBEDDING_MODEL", "EMBEDDING_MODEL")
    if not base_url:
        return None
    return {
        "name": "env:embedding",
        "base_url": base_url,
        "model": model or _infer_embedding_model(base_url) or DEFAULT_OPENAI_EMBEDDING_MODEL,
        "api_key": api_key,
        "proxy": _first_env("ASP_EMBEDDING_PROXY", "ASP_LLM_PROXY"),
        "dimensions": _parse_dimensions(),
    }


def resolve_embedding_config():
    """Resolve OpenAI-compatible embedding configuration without exposing secrets."""
    explicit = _explicit_env_embedding_config()
    if explicit is not None:
        return explicit

    from apps.settings.runtime_config import get_llm_configs

    configs = get_llm_configs()
    dimensions = _parse_dimensions()

    for config in configs:
        tags = set(config.get("tags") or [])
        if EMBEDDING_MODEL_TAG in tags and config.get("base_url") and config.get("model"):
            return {
                "name": str(config.get("name") or ""),
                "base_url": str(config["base_url"]).rstrip("/"),
                "model": str(config["model"]),
                "api_key": str(config.get("api_key") or ""),
                "proxy": str(config.get("proxy") or ""),
                "dimensions": dimensions,
            }

    for config in configs:
        base_url = str(config.get("base_url") or "").rstrip("/")
        if not base_url or not _supports_inferred_embeddings(base_url):
            continue
        inferred_model = _infer_embedding_model(base_url)
        if not inferred_model:
            continue
        return {
            "name": f"{config.get('name') or 'llm'}:embeddings",
            "base_url": base_url,
            "model": inferred_model,
            "api_key": str(config.get("api_key") or ""),
            "proxy": str(config.get("proxy") or ""),
            "dimensions": dimensions,
        }

    return None


class EmbeddingAPI:
    """Thin OpenAI-compatible embeddings client supporting Gemini, OpenAI, OpenRouter, and Ollama."""

    def __init__(self, *, config=None):
        self.config = resolve_embedding_config() if config is None else config
        if not isinstance(self.config, dict) or not self.config.get("base_url") or not self.config.get("model"):
            raise ValueError("No embedding provider configuration available.")

    @classmethod
    def is_configured(cls):
        return resolve_embedding_config() is not None

    def resolve_config_metadata(self):
        return {
            "provider_name": str(self.config.get("name") or ""),
            "model_name": str(self.config.get("model") or ""),
            "base_url": str(self.config.get("base_url") or ""),
        }

    def get_client(self):
        client_kwargs = {
            k: v
            for k, v in _http_client_kwargs(self.config).items()
            if k in {"http_client", "http_async_client"}
        }
        params = {
            "model": self.config["model"],
            "base_url": self.config["base_url"],
            "api_key": self.config.get("api_key") or "",
            # Send raw text rather than tiktoken integer arrays so non-OpenAI endpoints (e.g. Gemini) accept requests.
            "check_embedding_ctx_length": False,
            **client_kwargs,
        }
        dimensions = self.config.get("dimensions")
        if dimensions:
            params["dimensions"] = dimensions
        return OpenAIEmbeddings(**params)

    def embed_query(self, text):
        cleaned = str(text or "").strip()
        if not cleaned:
            return []
        vector = self.get_client().embed_query(cleaned)
        return [float(x) for x in vector]

    def embed_documents(self, texts):
        cleaned = [str(item or "").strip() for item in texts]
        if not cleaned:
            return []
        vectors = self.get_client().embed_documents(cleaned)
        return [[float(x) for x in vec] for vec in vectors]
