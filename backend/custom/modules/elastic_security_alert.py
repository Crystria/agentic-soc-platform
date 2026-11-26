from apps.agentic.runtime.base import BaseModule
from apps.webhook.service import ingest_elastic_security_alert


class Module(BaseModule):
    NAME = "Elastic Security Alert Processor"
    DESC = "Consumes alerts from Elastic Security (.alerts-security.alerts-*) or Kibana rules, extracts ECS artifacts, and correlates into cases."
    STREAM_NAME = "ELASTIC-SECURITY-ALERTS"
    THREAD_NUM = 2

    def run(self, message):
        if not isinstance(message, dict):
            raise ValueError("Elastic Security Alert Processor module expects a dict message.")

        return ingest_elastic_security_alert(
            message,
            schedule_analysis=True,
            trigger=self.STREAM_NAME,
        )
