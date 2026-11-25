import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("playbooks", "0003_playbook_finished_at_playbook_started_at_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="playbook",
            name="approval_note",
            field=models.TextField(blank=True, default="", help_text="Approval or rejection rationale (审批或拒绝说明)"),
        ),
        migrations.AddField(
            model_name="playbook",
            name="approved_at",
            field=models.DateTimeField(blank=True, help_text="Approval or rejection time (审批或拒绝时间)", null=True),
        ),
        migrations.AddField(
            model_name="playbook",
            name="approved_by",
            field=models.ForeignKey(blank=True, help_text="Analyst who approved or rejected the playbook run (审批或拒绝剧本执行的分析师)", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="approved_playbooks", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="playbook",
            name="requires_approval",
            field=models.BooleanField(default=False, help_text="Whether manual approval is required before execution (执行前是否需要人工审批)"),
        ),
        migrations.AddField(
            model_name="playbook",
            name="risk_level",
            field=models.CharField(blank=True, default="", help_text="Playbook risk level at submission (提交时的剧本风险等级)", max_length=20),
        ),
        migrations.AlterField(
            model_name="playbook",
            name="job_status",
            field=models.CharField(
                blank=True,
                choices=[
                    ("Awaiting Approval", "Awaiting Approval"),
                    ("Pending", "Pending"),
                    ("Running", "Running"),
                    ("Success", "Success"),
                    ("Failed", "Failed"),
                    ("Rejected", "Rejected"),
                ],
                default="",
                help_text="Background job status (后台任务状态)",
                max_length=20,
            ),
        ),
    ]
