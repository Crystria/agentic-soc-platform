from datetime import timedelta
import os
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from apps.agentic.analysis.hybrid_rag import (
    hybrid_search_knowledge_records,
    reciprocal_rank_fusion,
)
from apps.knowledge.models import Knowledge, KnowledgeSource
from apps.knowledge.vector_store import (
    RedisKnowledgeVectorStore,
    cosine_similarity,
    reindex_all_knowledge,
    search_vectors_in_postgres,
)
from apps.settings.models import LLMProviderConfig
from apps.settings.runtime_config import invalidate
from integrations.llm.embeddings import resolve_embedding_config


class FakeEmbeddingAPI:
    def __init__(self, vectors_by_substring, default_vector):
        self.vectors_by_substring = vectors_by_substring
        self.default_vector = default_vector

    def resolve_config_metadata(self):
        return {
            "provider_name": "env:gemini:embeddings",
            "model_name": "gemini-embedding-001",
            "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        }

    def _pick(self, text):
        lowered = (text or "").casefold()
        for key, vec in self.vectors_by_substring.items():
            if key.casefold() in lowered:
                return list(vec)
        return list(self.default_vector)

    def embed_query(self, text):
        return self._pick(text)

    def embed_documents(self, texts):
        return [self._pick(text) for text in texts]


class VectorMathAndStoreTests(SimpleTestCase):
    def test_should_compute_cosine_similarity_and_handle_edge_cases(self):
        self.assertAlmostEqual(cosine_similarity([1.0, 0.0], [1.0, 0.0]), 1.0)
        self.assertAlmostEqual(cosine_similarity([1.0, 0.0], [0.0, 1.0]), 0.0)
        self.assertEqual(cosine_similarity([], []), 0.0)
        self.assertEqual(cosine_similarity([1.0], [1.0, 2.0]), 0.0)

    def test_should_parse_resp3_and_resp2_redisearch_results(self):
        fake_client = MagicMock()
        future_ts = (timezone.now() + timedelta(days=2)).timestamp()
        past_ts = (timezone.now() - timedelta(days=2)).timestamp()

        fake_client.execute_command.return_value = {
            b"results": [
                {b"id": b"asp:rag:knowledge:1", b"extra_attributes": {b"pk": b"id-1", b"score": b"0.12", b"expires_ts": b"-1"}},
                {b"id": b"asp:rag:knowledge:2", b"extra_attributes": {b"pk": b"id-2", b"score": b"0.05", b"expires_ts": str(past_ts).encode()}},
                {b"id": b"asp:rag:knowledge:3", b"extra_attributes": {b"pk": b"id-3", b"score": b"0.30", b"expires_ts": str(future_ts).encode()}},
            ]
        }
        store = RedisKnowledgeVectorStore(client=fake_client)
        hits = store.search([1.0, 0.0, 0.0], top_k=5, min_score=0.5)
        self.assertEqual(hits[0][0], "id-1")
        self.assertAlmostEqual(hits[0][1], 0.88)
        self.assertEqual(hits[1][0], "id-3")
        self.assertAlmostEqual(hits[1][1], 0.70)


class HybridRagIntegrationTests(TestCase):
    def setUp(self):
        invalidate("llm")

    def tearDown(self):
        invalidate("llm")

    def test_should_infer_gemini_embedding_model_from_chat_provider(self):
        LLMProviderConfig.objects.create(
            name="env:gemini",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai",
            model="gemini-2.5-flash",
            api_key="test-key",
            tags=["structured_output"],
            enabled=True,
            priority=50,
        )
        invalidate("llm")
        with patch.dict(os.environ, {}, clear=True):
            config = resolve_embedding_config()
        self.assertIsNotNone(config)
        self.assertEqual(config["model"], "gemini-embedding-001")

    def test_should_fuse_lexical_and_cross_language_semantic_results_with_rrf(self):
        k_vi = Knowledge.objects.create(
            title="Quy trinh xu ly danh cap mat khau bo nho LSASS",
            body="Khi phat hien Mimikatz hoac truy cap lsass.exe, can co lap endpoint va doi mat khau.",
            source=KnowledgeSource.MANUAL,
            tags=["credential-access", "lsass"],
            embedding_vector=[0.95, 0.05, 0.0],
            embedding_model="gemini-embedding-001",
            embedding_dimensions=3,
        )
        k_exact = Knowledge.objects.create(
            title="SSH brute force exclusion for sec-scanner-01",
            body="198.51.100.45 is a known benign scanner",
            source=KnowledgeSource.MANUAL,
            tags=["ssh", "scanner"],
            embedding_vector=[0.0, 0.1, 0.99],
            embedding_model="gemini-embedding-001",
            embedding_dimensions=3,
        )
        Knowledge.objects.create(
            title="Expired credential handling note",
            body="Expired record should never be retrieved",
            source=KnowledgeSource.MANUAL,
            expires_at=timezone.now() - timedelta(hours=1),
            embedding_vector=[1.0, 0.0, 0.0],
            embedding_model="gemini-embedding-001",
            embedding_dimensions=3,
        )

        # Case written in English without exact keyword overlap with Vietnamese k_vi title
        case_payload = {
            "title": "OS Credential Dumping on Windows host",
            "category": "EDR",
            "description": "Suspicious process memory read against security authority subsystem",
            "tags": ["T1003.001"],
            "alerts": [{"rule_name": "LSASS Memory Read", "artifacts": [{"type": "IP", "value": "198.51.100.45"}]}],
        }
        fake_api = FakeEmbeddingAPI(
            {"OS Credential Dumping": [0.98, 0.02, 0.0]},
            default_vector=[0.0, 1.0, 0.0],
        )
        offline_store = MagicMock()
        offline_store.stats.return_value = {"available": False, "docs": 0}

        records, meta = hybrid_search_knowledge_records(
            case_payload,
            ["198.51.100.45"],
            limit=5,
            embedding_api=fake_api,
            vector_store=offline_store,
        )

        ids = [item["knowledge_id"] for item in records]
        self.assertEqual(meta["mode"], "hybrid")
        self.assertEqual(meta["vector_backend"], "postgres")
        self.assertIn(k_vi.knowledge_id, ids)
        self.assertIn(k_exact.knowledge_id, ids)
        self.assertEqual(len(ids), 2)

        fused_direct = reciprocal_rank_fusion([k_exact], [(k_vi, 0.99)], limit=5)
        self.assertEqual(fused_direct[0].pk, k_vi.pk)

    def test_should_reindex_knowledge_idempotently(self):
        Knowledge.objects.create(
            title="Ransomware backup exclusion",
            body="VeeamAgent runs nightly backup",
            source=KnowledgeSource.MANUAL,
            tags=["backup"],
        )
        fake_api = FakeEmbeddingAPI({"VeeamAgent": [0.8, 0.6, 0.0]}, default_vector=[0.1, 0.2, 0.3])
        fake_store = MagicMock()
        fake_store.upsert_record.return_value = True

        first = reindex_all_knowledge(embedding_api=fake_api, vector_store=fake_store)
        second = reindex_all_knowledge(embedding_api=fake_api, vector_store=fake_store)

        self.assertEqual(first["indexed"], 1)
        self.assertEqual(second["indexed"], 0)
        self.assertEqual(second["redis_synced"], 1)

        pg_hits = search_vectors_in_postgres([0.8, 0.6, 0.0], top_k=5, min_score=0.5)
        self.assertEqual(len(pg_hits), 1)
        self.assertGreater(pg_hits[0][1], 0.99)
