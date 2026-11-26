from django.core.management.base import BaseCommand, CommandError

from apps.knowledge.vector_store import reindex_all_knowledge
from integrations.llm.embeddings import EmbeddingAPI


class Command(BaseCommand):
    help = "Compute and synchronize Hybrid RAG embeddings for Knowledge records into PostgreSQL and Redis Stack."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Re-embed all records even if model matches.")
        parser.add_argument("--dry-run", action="store_true", help="Preview indexing work without writing changes.")
        parser.add_argument(
            "--strict",
            action="store_true",
            help="Exit with non-zero status if embedding provider is unconfigured or API fails.",
        )

    def handle(self, *args, **options):
        force = bool(options.get("force"))
        dry_run = bool(options.get("dry_run"))
        strict = bool(options.get("strict"))

        if not EmbeddingAPI.is_configured():
            message = "No embedding provider configured; skipping Knowledge vector indexing."
            if strict:
                raise CommandError(message)
            self.stdout.write(message)
            return

        try:
            summary = reindex_all_knowledge(force=force, dry_run=dry_run)
        except Exception as exc:
            if strict:
                raise CommandError(f"Knowledge vector indexing failed: {exc}") from exc
            self.stdout.write(f"Knowledge vector indexing skipped due to error: {exc}")
            return

        if dry_run:
            self.stdout.write(
                f"[DRY RUN] total={summary['total']}, to_embed={summary['to_embed']}, "
                f"redis_resync={summary['redis_resync']}, skipped={summary['skipped']}, model={summary['model_name']}"
            )
            return

        self.stdout.write(
            f"Knowledge reindex complete: total={summary['total']}, indexed={summary['indexed']}, "
            f"redis_synced={summary['redis_synced']}, skipped={summary['skipped']}, "
            f"model={summary['model_name']}, redis_available={summary['redis_available']}"
        )
