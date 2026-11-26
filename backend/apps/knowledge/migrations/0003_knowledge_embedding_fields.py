from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("knowledge", "0002_knowledge_knowledge_created_src_idx"),
    ]

    operations = [
        migrations.AddField(
            model_name="knowledge",
            name="embedding_dimensions",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="knowledge",
            name="embedding_model",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="knowledge",
            name="embedding_updated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="knowledge",
            name="embedding_vector",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Dense embedding vector stored for hybrid semantic RAG fallback and backfill",
            ),
        ),
    ]
