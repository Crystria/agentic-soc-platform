import logging

from django.db.models import Q
from django.utils import timezone

from apps.agentic.analysis.profiles import AI_PROFILE_AGENT, serialize_for_ai
from apps.knowledge.models import Knowledge
from apps.knowledge.vector_store import (
    RedisKnowledgeVectorStore,
    search_vectors_in_postgres,
)
from integrations.llm.embeddings import EmbeddingAPI

logger = logging.getLogger(__name__)

MAX_SEMANTIC_QUERY_CHARS = 1500
DEFAULT_MIN_VECTOR_SIMILARITY = 0.25
RRF_RANK_CONSTANT = 60


def _valid_knowledge_queryset():
    valid_time_query = Q(expires_at__isnull=True) | Q(expires_at__gte=timezone.now())
    return Knowledge.objects.filter(valid_time_query)


def build_case_semantic_query(case_payload, keywords=None):
    """Build a compact semantic search query string from Case, Alert, Artifact, and keyword context."""
    parts = []
    title = (case_payload.get("title") or "").strip()
    category = (case_payload.get("category") or "").strip()
    description = (case_payload.get("description") or "").strip()
    tags = [str(tag).strip() for tag in (case_payload.get("tags") or []) if str(tag).strip()]

    if title:
        parts.append(f"Title: {title}")
    if category:
        parts.append(f"Category: {category}")
    if tags:
        parts.append(f"Tags: {', '.join(tags[:10])}")
    if keywords:
        parts.append(f"Keywords: {', '.join(str(k).strip() for k in keywords if str(k).strip())}")
    if description:
        parts.append(description[:400])

    for alert in (case_payload.get("alerts") or [])[:5]:
        alert_bits = [
            alert.get("rule_name"),
            alert.get("title"),
            alert.get("tactic"),
            alert.get("technique"),
            alert.get("desc"),
        ]
        summary_line = " | ".join(str(bit).strip() for bit in alert_bits if str(bit or "").strip())
        if summary_line:
            parts.append(summary_line[:220])
        for artifact in (alert.get("artifacts") or [])[:6]:
            val = str(artifact.get("value") or "").strip()
            atype = str(artifact.get("type") or "").strip()
            if val:
                parts.append(f"{atype}: {val}" if atype else val)

    return "\n".join(parts).strip()[:MAX_SEMANTIC_QUERY_CHARS]


def _score_lexical_match(record, normalized_keywords):
    score = 0.0
    title_lower = (record.title or "").casefold()
    body_lower = (record.body or "").casefold()
    tags_lower = {str(tag).strip().casefold() for tag in (record.tags or []) if str(tag).strip()}

    for kw in normalized_keywords:
        kw_lower = kw.casefold()
        if kw_lower in title_lower:
            score += 3.0
        if kw_lower in tags_lower:
            score += 2.5
        if kw_lower in body_lower:
            score += 1.0
    return score


def lexical_search_knowledge(keywords, *, limit=20):
    """Keyword/lexical PostgreSQL retrieval ranked by title, tag, and body matches."""
    cleaned = [str(kw).strip() for kw in (keywords or []) if str(kw).strip()]
    if not cleaned:
        return []

    keyword_query = Q()
    for keyword in cleaned:
        keyword_query |= Q(title__icontains=keyword)
        keyword_query |= Q(body__icontains=keyword)
        keyword_query |= Q(tags__contains=[keyword])

    candidates = list(_valid_knowledge_queryset().filter(keyword_query).order_by("-created_at")[: max(limit * 3, 30)])
    candidates.sort(
        key=lambda rec: (_score_lexical_match(rec, cleaned), rec.created_at.timestamp() if rec.created_at else 0.0),
        reverse=True,
    )
    return candidates[:limit]


def semantic_search_knowledge(
    query_text,
    *,
    limit=20,
    min_score=DEFAULT_MIN_VECTOR_SIMILARITY,
    embedding_api=None,
    vector_store=None,
):
    """Semantic vector search using Redis Stack RediSearch with PostgreSQL cosine fallback."""
    if not query_text or (embedding_api is None and not EmbeddingAPI.is_configured()):
        return [], "none", ""

    try:
        api = embedding_api or EmbeddingAPI()
        model_name = api.resolve_config_metadata()["model_name"]
        query_vector = api.embed_query(query_text)
    except Exception as exc:
        logger.warning("Semantic query embedding failed, continuing with lexical RAG: %s", exc)
        return [], "none", ""

    if not query_vector:
        return [], "none", model_name

    store = vector_store or RedisKnowledgeVectorStore()
    store_stats = store.stats()
    if store_stats.get("available") and (store_stats.get("docs") or 0) > 0:
        redis_hits = store.search(query_vector, top_k=limit, min_score=min_score)
        if redis_hits is not None:
            pk_order = [pk for pk, _score in redis_hits]
            records_by_pk = {
                str(rec.pk): rec
                for rec in _valid_knowledge_queryset().filter(pk__in=pk_order)
            }
            ordered = [(records_by_pk[pk], score) for pk, score in redis_hits if pk in records_by_pk]
            return ordered[:limit], "redis", model_name

    pg_hits = search_vectors_in_postgres(query_vector, top_k=limit, min_score=min_score)
    return pg_hits, "postgres", model_name


def reciprocal_rank_fusion(
    lexical_records,
    semantic_ranked,
    *,
    limit=10,
    k=RRF_RANK_CONSTANT,
    lexical_weight=1.0,
    semantic_weight=1.2,
):
    """Merge lexical and vector ranked Knowledge results via Reciprocal Rank Fusion."""
    scores = {}
    records_by_pk = {}

    for rank, record in enumerate(lexical_records, start=1):
        pk = str(record.pk)
        records_by_pk[pk] = record
        scores[pk] = scores.get(pk, 0.0) + (lexical_weight / (k + rank))

    for rank, (record, _similarity) in enumerate(semantic_ranked, start=1):
        pk = str(record.pk)
        records_by_pk[pk] = record
        scores[pk] = scores.get(pk, 0.0) + (semantic_weight / (k + rank))

    ranked_pks = sorted(scores.keys(), key=lambda pk: scores[pk], reverse=True)[:limit]
    return [records_by_pk[pk] for pk in ranked_pks]


def hybrid_search_knowledge_records(
    case_payload,
    keywords,
    *,
    limit=10,
    embedding_api=None,
    vector_store=None,
):
    """Run Hybrid RAG (lexical keyword + dense vector search fused with RRF)."""
    candidate_limit = max(limit * 2, 10)
    lexical_records = lexical_search_knowledge(keywords, limit=candidate_limit)

    semantic_query = build_case_semantic_query(case_payload, keywords=keywords)
    semantic_ranked, vector_backend, embedding_model = semantic_search_knowledge(
        semantic_query,
        limit=candidate_limit,
        embedding_api=embedding_api,
        vector_store=vector_store,
    )

    fused = reciprocal_rank_fusion(lexical_records, semantic_ranked, limit=limit)
    if lexical_records and semantic_ranked:
        mode = "hybrid"
    elif semantic_ranked:
        mode = "vector"
    elif lexical_records:
        mode = "lexical"
    else:
        mode = "none"

    meta = {
        "mode": mode,
        "lexical_hits": len(lexical_records),
        "semantic_hits": len(semantic_ranked),
        "fused_count": len(fused),
        "vector_backend": vector_backend,
        "embedding_model": embedding_model,
    }
    return [serialize_for_ai(record, AI_PROFILE_AGENT) for record in fused], meta
