from apps.agentic.runtime.base import BaseModule
from apps.webhook.service import ingest_wazuh_alert


class Module(BaseModule):
    NAME = "Wazuh Alert Processor"
    DESC = "Consumes alerts from Wazuh SIEM/EDR, extracts artifacts, and correlates into cases."
    STREAM_NAME = "WAZUH-ALERTS"
    THREAD_NUM = 2

    def run(self, message):
        if not isinstance(message, dict):
            raise ValueError("Wazuh Alert Processor module expects a dict message.")

        return ingest_wazuh_alert(
            message,
            schedule_analysis=True,
            trigger=self.STREAM_NAME,
        )

