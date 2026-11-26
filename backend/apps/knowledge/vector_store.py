import logging
import math
import struct

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
import redis
from redis.exceptions import RedisError

from apps.knowledge.models import Knowledge
from integrations.llm.embeddings import EmbeddingAPI

logger = logging.getLogger(__name__)

KNOWLEDGE_VECTOR_INDEX = "idx:asp:knowledge"
KNOWLEDGE_VECTOR_PREFIX = "asp:rag:knowledge:"
KNOWLEDGE_INDEX_SKIP_UPDATE_FIELDS = frozenset(
    {"embedding_vector", "embedding_model", "embedding_dimensions", "embedding_updated_at"}
)


def cosine_similarity(vec_a, vec_b):
    """Compute cosine similarity in [-1.0, 1.0] safely for two numeric sequences."""
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for a, b in zip(vec_a, vec_b):
        fa = float(a)
        fb = float(b)
        dot += fa * fb
        norm_a += fa * fa
        norm_b += fb * fb
    if norm_a <= 0.0 or norm_b <= 0.0:
        return 0.0
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


def build_knowledge_document_text(record):
    """Build normalized document representation for embedding a Knowledge record."""
    parts = []
    title = (getattr(record, "title", "") or "").strip()
    tags = [str(tag).strip() for tag in (getattr(record, "tags", None) or []) if str(tag).strip()]
    body = (getattr(record, "body", "") or "").strip()
    if title:
        parts.append(f"Title: {title}")
    if tags:
        parts.append(f"Tags: {', '.join(tags)}")
    if body:
        parts.append(body)
    return "\n".join(parts).strip()


def _pack_float32(vector):
    return struct.pack(f"<{len(vector)}f", *(float(x) for x in vector))


def _decode_scalar(value):
    if isinstance(value, (bytes, bytearray)):
        return value.decode("utf-8", errors="replace")
    return value


def _lookup_dict(mapping, key):
    if not isinstance(mapping, dict):
        return None
    if key in mapping:
        return mapping[key]
    bkey = key.encode("utf-8") if isinstance(key, str) else key
    return mapping.get(bkey)


def _redis_db0_client():
    """Return a Redis client targeting logical DB 0 (required by RediSearch)."""
    return redis.Redis(
        host=getattr(settings, "REDIS_HOST", "localhost"),
        port=int(getattr(settings, "REDIS_PORT", 6379)),
        db=0,
        password=getattr(settings, "REDIS_PASSWORD", "") or None,
        socket_timeout=2,
        socket_connect_timeout=2,
    )


def _extract_index_vector_dim(info):
    if not isinstance(info, dict):
        return None
    attributes = _lookup_dict(info, "attributes") or []
    for attr in attributes:
        if not isinstance(attr, dict):
            continue
        attr_name = _decode_scalar(_lookup_dict(attr, "attribute") or _lookup_dict(attr, "identifier"))
        if attr_name == "vector":
            dim = _lookup_dict(attr, "dim")
            return int(dim) if dim is not None else None
    return None


def _parse_search_results(raw_response):
    """Parse both RESP3 dict and RESP2 list RediSearch FT.SEARCH outputs."""
    if isinstance(raw_response, dict):
        results = _lookup_dict(raw_response, "results") or []
        parsed = []
        for item in results:
            if not isinstance(item, dict):
                continue
            attrs = _lookup_dict(item, "extra_attributes") or {}
            pk = _decode_scalar(_lookup_dict(attrs, "pk"))
            score_raw = _decode_scalar(_lookup_dict(attrs, "score"))
            expires_raw = _decode_scalar(_lookup_dict(attrs, "expires_ts"))
            parsed.append((pk, score_raw, expires_raw))
        return parsed

    if isinstance(raw_response, list) and len(raw_response) > 1:
        parsed = []
        idx = 1
        while idx + 1 < len(raw_response):
            fields_list = raw_response[idx + 1]
            idx += 2
            if not isinstance(fields_list, list):
                continue
            attrs = {
                _decode_scalar(fields_list[pos]): _decode_scalar(fields_list[pos + 1])
                for pos in range(0, len(fields_list) - 1, 2)
            }
            parsed.append((attrs.get("pk"), attrs.get("score"), attrs.get("expires_ts")))
        return parsed

    return []


class RedisKnowledgeVectorStore:
    """Vector index manager backed by Redis Stack RediSearch (DB 0)."""

    def __init__(self, client=None):
        self._client = client

    def _get_client(self):
        return self._client or _redis_db0_client()

    def ensure_index(self, dimensions):
        if not dimensions or dimensions <= 0:
            return False
        client = self._get_client()
        try:
            info = client.execute_command("FT.INFO", KNOWLEDGE_VECTOR_INDEX)
            existing_dim = _extract_index_vector_dim(info)
            if existing_dim == int(dimensions):
                return True
            client.execute_command("FT.DROPINDEX", KNOWLEDGE_VECTOR_INDEX)
        except RedisError:
            pass

        client.execute_command(
            "FT.CREATE",
            KNOWLEDGE_VECTOR_INDEX,
            "ON",
            "HASH",
            "PREFIX",
            "1",
            KNOWLEDGE_VECTOR_PREFIX,
            "SCHEMA",
            "pk",
            "TAG",
            "knowledge_id",
            "TAG",
            "source",
            "TAG",
            "title",
            "TEXT",
            "expires_ts",
            "NUMERIC",
            "vector",
            "VECTOR",
            "FLAT",
            "6",
            "TYPE",
            "FLOAT32",
            "DIM",
            str(int(dimensions)),
            "DISTANCE_METRIC",
            "COSINE",
        )
        return True

    def upsert_record(self, record):
        vector = getattr(record, "embedding_vector", None) or []
        if not vector:
            return False
        client = self._get_client()
        self.ensure_index(len(vector))
        expires_at = getattr(record, "expires_at", None)
        expires_ts = expires_at.timestamp() if expires_at else -1.0
        key = f"{KNOWLEDGE_VECTOR_PREFIX}{record.pk}"
        client.hset(
            key,
            mapping={
                "pk": str(record.pk),
                "knowledge_id": str(record.knowledge_id or ""),
                "source": str(record.source or ""),
                "title": str(record.title or ""),
                "expires_ts": str(expires_ts),
                "vector": _pack_float32(vector),
            },
        )
        return True

    def delete_record(self, pk):
        client = self._get_client()
        client.delete(f"{KNOWLEDGE_VECTOR_PREFIX}{pk}")

    def search(self, query_vector, *, top_k=10, min_score=0.25):
        if not query_vector or top_k <= 0:
            return None
        client = self._get_client()
        try:
            raw = client.execute_command(
                "FT.SEARCH",
                KNOWLEDGE_VECTOR_INDEX,
                f"*=>[KNN {int(top_k)} @vector $qvec AS score]",
                "PARAMS",
                "2",
                "qvec",
                _pack_float32(query_vector),
                "SORTBY",
                "score",
                "LIMIT",
                "0",
                str(int(top_k)),
                "RETURN",
                "3",
                "pk",
                "score",
                "expires_ts",
                "DIALECT",
                "2",
            )
        except RedisError as exc:
            logger.debug("Redis vector search unavailable, falling back to Postgres: %s", exc)
            return None

        now_ts = timezone.now().timestamp()
        matches = []
        for pk, distance_raw, expires_raw in _parse_search_results(raw):
            if not pk or distance_raw is None:
                continue
            try:
                expires_ts = float(expires_raw) if expires_raw is not None else -1.0
                if expires_ts > 0 and expires_ts < now_ts:
                    continue
                similarity = 1.0 - float(distance_raw)
            except (TypeError, ValueError):
                continue
            if similarity >= min_score:
                matches.append((str(pk), similarity))
        return matches

    def stats(self):
        client = self._get_client()
        try:
            info = client.execute_command("FT.INFO", KNOWLEDGE_VECTOR_INDEX)
        except RedisError:
            return {
                "available": False,
                "index_name": KNOWLEDGE_VECTOR_INDEX,
                "docs": 0,
                "dimensions": None,
            }
        num_docs = _lookup_dict(info, "num_docs")
        return {
            "available": True,
            "index_name": KNOWLEDGE_VECTOR_INDEX,
            "docs": int(num_docs) if num_docs is not None else 0,
            "dimensions": _extract_index_vector_dim(info),
        }


def search_vectors_in_postgres(query_vector, *, top_k=10, min_score=0.25):
    """Exact cosine similarity search over Knowledge rows persisted in PostgreSQL."""
    if not query_vector or top_k <= 0:
        return []
    dim = len(query_vector)
    valid_time_query = Q(expires_at__isnull=True) | Q(expires_at__gte=timezone.now())
    candidates = Knowledge.objects.filter(valid_time_query, embedding_dimensions=dim)

    scored = []
    for record in candidates:
        sim = cosine_similarity(query_vector, record.embedding_vector)
        if sim >= min_score:
            scored.append((record, sim))
    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[:top_k]


def index_knowledge_record(record, *, embedding_api=None, vector_store=None):
    """Compute and persist embedding for one Knowledge record and sync Redis index."""
    doc_text = build_knowledge_document_text(record)
    if not doc_text:
        return False

    api = embedding_api or EmbeddingAPI()
    vector = api.embed_query(doc_text)
    if not vector:
        return False

    model_name = api.resolve_config_metadata()["model_name"]
    now = timezone.now()
    Knowledge.objects.filter(pk=record.pk).update(
        embedding_vector=vector,
        embedding_model=model_name,
        embedding_dimensions=len(vector),
        embedding_updated_at=now,
    )
    record.embedding_vector = vector
    record.embedding_model = model_name
    record.embedding_dimensions = len(vector)
    record.embedding_updated_at = now

    store = vector_store or RedisKnowledgeVectorStore()
    try:
        store.upsert_record(record)
    except RedisError as exc:
        logger.warning("Failed to upsert Knowledge %s into Redis vector index: %s", record.pk, exc)
    return True


def safe_sync_knowledge_index(knowledge_pk):
    """Best-effort indexing hook safe for post_save on_commit callbacks."""
    if not EmbeddingAPI.is_configured():
        return False
    record = Knowledge.objects.filter(pk=knowledge_pk).first()
    if record is None:
        return False
    try:
        return index_knowledge_record(record)
    except Exception as exc:
        logger.warning("Skipped auto-indexing Knowledge %s: %s", knowledge_pk, exc)
        return False


def safe_delete_knowledge_index(knowledge_pk):
    """Best-effort delete hook for Redis vector store."""
    try:
        RedisKnowledgeVectorStore().delete_record(knowledge_pk)
    except RedisError as exc:
        logger.debug("Skipped deleting Knowledge %s from Redis vector index: %s", knowledge_pk, exc)


def reindex_all_knowledge(*, force=False, dry_run=False, embedding_api=None, vector_store=None):
    """Embed and index Knowledge rows in PostgreSQL and Redis Stack."""
    api = embedding_api or EmbeddingAPI()
    target_model = api.resolve_config_metadata()["model_name"]
    store = vector_store or RedisKnowledgeVectorStore()

    records = list(Knowledge.objects.order_by("created_at"))
    to_embed = []
    redis_sync_only = []
    skipped = 0

    for record in records:
        doc_text = build_knowledge_document_text(record)
        if not doc_text:
            skipped += 1
            continue
        same_model = record.embedding_model == target_model and record.has_embedding
        if same_model and not force:
            redis_sync_only.append(record)
        else:
            to_embed.append((record, doc_text))

    if dry_run:
        return {
            "total": len(records),
            "to_embed": len(to_embed),
            "redis_resync": len(redis_sync_only),
            "skipped": skipped,
            "model_name": target_model,
            "redis_available": None,
        }

    indexed = 0
    if to_embed:
        vectors = api.embed_documents([doc_text for _rec, doc_text in to_embed])
        now = timezone.now()
        for (record, _doc_text), vector in zip(to_embed, vectors):
            if not vector:
                continue
            Knowledge.objects.filter(pk=record.pk).update(
                embedding_vector=vector,
                embedding_model=target_model,
                embedding_dimensions=len(vector),
                embedding_updated_at=now,
            )
            record.embedding_vector = vector
            record.embedding_model = target_model
            record.embedding_dimensions = len(vector)
            record.embedding_updated_at = now
            indexed += 1
            redis_sync_only.append(record)

    redis_synced = 0
    redis_available = True
    for record in redis_sync_only:
        try:
            if store.upsert_record(record):
                redis_synced += 1
        except RedisError as exc:
            redis_available = False
            logger.warning("Redis vector index sync unavailable during reindex: %s", exc)
            break

    return {
        "total": len(records),
        "indexed": indexed,
        "redis_synced": redis_synced,
        "skipped": skipped,
        "model_name": target_model,
        "redis_available": redis_available,
    }
