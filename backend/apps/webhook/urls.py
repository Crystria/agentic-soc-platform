from django.urls import path

from apps.webhook.views import KibanaWebhookView, SplunkWebhookView, WazuhWebhookView

urlpatterns = [
    path("webhook/splunk/", SplunkWebhookView.as_view(), name="webhook-splunk"),
    path("webhook/kibana/", KibanaWebhookView.as_view(), name="webhook-kibana"),
    path("webhook/wazuh/", WazuhWebhookView.as_view(), name="webhook-wazuh"),
]
