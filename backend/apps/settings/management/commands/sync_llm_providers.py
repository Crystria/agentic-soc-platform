from django.core.management.base import BaseCommand

from apps.settings.env_sync import load_project_dotenv_files, sync_llm_providers_from_env


class Command(BaseCommand):
    help = "Sync LLM provider configurations from environment variables into LLMProviderConfig."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview changes without modifying the database.",
        )

    def handle(self, *args, **options):
        load_project_dotenv_files()
        dry_run = bool(options.get("dry_run"))
        results = sync_llm_providers_from_env(dry_run=dry_run)
        if not results:
            self.stdout.write(
                "No LLM provider environment variables detected "
                "(supported: GEMINI_API_KEY, GOOGLE_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, "
                "DEEPSEEK_API_KEY, GROQ_API_KEY, OLLAMA_BASE_URL, ASP_LLM_BASE_URL, ASP_LLM_PROVIDERS_JSON)."
            )
            return

        prefix = "[DRY RUN] " if dry_run else ""
        for item in results:
            self.stdout.write(
                f"{prefix}{item['action']}: {item['name']} "
                f"(model={item['model']}, base_url={item['base_url']}, tags={','.join(item['tags'])})"
            )
