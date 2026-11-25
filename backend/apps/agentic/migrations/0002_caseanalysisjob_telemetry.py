from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("agentic", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="caseanalysisjob",
            name="input_tokens",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="caseanalysisjob",
            name="knowledge_keywords_count",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="caseanalysisjob",
            name="knowledge_records_count",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="caseanalysisjob",
            name="latency_ms",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="caseanalysisjob",
            name="model_name",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="caseanalysisjob",
            name="output_tokens",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="caseanalysisjob",
            name="prompt_version",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="caseanalysisjob",
            name="provider_name",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="caseanalysisjob",
            name="total_tokens",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="caseanalysisjob",
            index=models.Index(fields=["status", "scheduled_at"], name="agentic_job_status_sched_idx"),
        ),
        migrations.AddIndex(
            model_name="caseanalysisjob",
            index=models.Index(fields=["created_at", "status"], name="agentic_job_created_status_idx"),
        ),
    ]
