from typing import Any

from pydantic import BaseModel, Field


class SplunkPayload(BaseModel):
    search_name: str
    result: dict[str, Any]
    sid: str | None = None
    app: str | None = None
    owner: str | None = None
    results_link: str | None = None


class KibanaRule(BaseModel):
    name: str


class KibanaContext(BaseModel):
    hits: list[Any]


class KibanaPayload(BaseModel):
    rule: KibanaRule
    context: KibanaContext


class WazuhMitre(BaseModel):
    id: list[str] | str | None = None
    tactic: list[str] | str | None = None
    technique: list[str] | str | None = None


class WazuhRule(BaseModel):
    id: str | int | None = None
    level: int = 0
    description: str = "Wazuh Alert"
    mitre: WazuhMitre | dict[str, Any] | None = None
    groups: list[str] = Field(default_factory=list)


class WazuhAgent(BaseModel):
    id: str | None = None
    name: str | None = None
    ip: str | None = None


class WazuhAlert(BaseModel):
    timestamp: str | None = None
    rule: WazuhRule = Field(default_factory=WazuhRule)
    agent: WazuhAgent | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    decoder: dict[str, Any] = Field(default_factory=dict)
    location: str | None = None
    full_log: str | None = None
    id: str | None = None


class WazuhPayload(BaseModel):
    alert: WazuhAlert | None = None
    rule: WazuhRule | None = None
    agent: WazuhAgent | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    timestamp: str | None = None
    full_log: str | None = None


class WebhookResult(BaseModel):
    status: str = "success"
    stream: str
    sent: int = 0
    skipped: int = 0
    message_ids: list[str] = Field(default_factory=list)
