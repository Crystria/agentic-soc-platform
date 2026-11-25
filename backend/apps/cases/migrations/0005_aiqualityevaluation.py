import django.db.models.deletion
import django.utils.timezone
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("agentic", "0001_initial"),
        ("cases", "0004_caserelationship"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AiQualityEvaluation",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("coverage_state", models.CharField(choices=[("Evaluated", "Evaluated"), ("No prediction", "No Prediction"), ("Invalid prediction", "Invalid Prediction")], db_index=True, max_length=24)),
                ("ai_verdict", models.CharField(blank=True, default="", max_length=30)),
                ("human_verdict", models.CharField(blank=True, default="", max_length=30)),
                ("verdict_agrees", models.BooleanField(blank=True, null=True)),
                ("ai_severity", models.CharField(blank=True, default="", max_length=20)),
                ("human_severity", models.CharField(blank=True, db_index=True, default="", max_length=20)),
                ("severity_agrees", models.BooleanField(blank=True, null=True)),
                ("severity_distance", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("severity_direction", models.CharField(blank=True, choices=[("match", "Match"), ("overestimate", "Overestimate"), ("underestimate", "Underestimate")], default="", max_length=16)),
                ("ai_impact", models.CharField(blank=True, default="", max_length=20)),
                ("human_impact", models.CharField(blank=True, default="", max_length=20)),
                ("impact_agrees", models.BooleanField(blank=True, null=True)),
                ("impact_distance", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("impact_direction", models.CharField(blank=True, choices=[("match", "Match"), ("overestimate", "Overestimate"), ("underestimate", "Underestimate")], default="", max_length=16)),
                ("ai_priority", models.CharField(blank=True, default="", max_length=20)),
                ("human_priority", models.CharField(blank=True, default="", max_length=20)),
                ("priority_agrees", models.BooleanField(blank=True, null=True)),
                ("priority_distance", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("priority_direction", models.CharField(blank=True, choices=[("match", "Match"), ("overestimate", "Overestimate"), ("underestimate", "Underestimate")], default="", max_length=16)),
                ("ai_confidence", models.CharField(blank=True, default="", max_length=20)),
                ("human_confidence", models.CharField(blank=True, default="", max_length=20)),
                ("confidence_agrees", models.BooleanField(blank=True, null=True)),
                ("confidence_distance", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("confidence_direction", models.CharField(blank=True, choices=[("match", "Match"), ("overestimate", "Overestimate"), ("underestimate", "Underestimate")], default="", max_length=16)),
                ("category_snapshot", models.CharField(blank=True, db_index=True, default="", max_length=30)),
                ("closed_at", models.DateTimeField(db_index=True)),
                ("evaluated_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("assignee_snapshot", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="ai_quality_evaluations", to=settings.AUTH_USER_MODEL)),
                ("case", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="ai_quality_evaluation", to="cases.case")),
                ("reference_job", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="ai_quality_evaluations", to="agentic.caseanalysisjob")),
            ],
            options={
                "db_table": "ai_quality_evaluations",
                "ordering": ["-closed_at"],
                "indexes": [
                    models.Index(fields=["closed_at", "coverage_state"], name="ai_qual_closed_cov_idx"),
                    models.Index(fields=["category_snapshot", "closed_at"], name="ai_qual_cat_closed_idx"),
                    models.Index(fields=["assignee_snapshot", "closed_at"], name="ai_qual_assignee_closed_idx"),
                ],
            },
        ),
    ]
