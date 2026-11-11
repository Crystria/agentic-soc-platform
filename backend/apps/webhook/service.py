from apps.agentic.runtime.base import generate_correlation_uid, parse_event_time
from apps.agentic.services.alerts import create_alert_with_context
from apps.alerts.models import (
    AlertAction,
    AlertAnalyticType,
    AlertPolicyType,
    AlertRiskLevel,
    AlertStatus,
    Confidence,
    Disposition,
    Impact,
    ProductCategory,
    Severity,
)
from apps.artifacts.models import ArtifactName, ArtifactRole, ArtifactType
from apps.cases.models import CaseConfidence, CaseImpact, CasePriority
from apps.common.redis_stream import RedisStreamClient
from apps.settings.runtime_config import get_stream_maxlen
from apps.webhook.schemas import KibanaPayload, SplunkPayload, WebhookResult


class WebhookRedisError(RuntimeError):
    pass


def handle_splunk_webhook(payload, *, redis_client=None):
    parsed = SplunkPayload.model_validate(payload)
    stream = parsed.search_name.strip()
    if not stream:
        raise ValueError("search_name is required.")

    redis_client = redis_client or RedisStreamClient()
    try:
        message_id = redis_client.send_message(stream, parsed.result, maxlen=get_stream_maxlen())
    except Exception as exc:
        raise WebhookRedisError(f"Failed to write Redis stream {stream}: {type(exc).__name__}") from exc

    return WebhookResult(stream=stream, sent=1, skipped=0, message_ids=[message_id])


def handle_kibana_webhook(payload, *, redis_client=None):
    parsed = KibanaPayload.model_validate(payload)
    stream = parsed.rule.name.strip()
    if not stream:
        raise ValueError("rule.name is required.")

    redis_client = redis_client or RedisStreamClient()
    sent = 0
    skipped = 0
    message_ids = []
    for hit in parsed.context.hits:
        source = extract_source(hit)
        if not source:
            skipped += 1
            continue
        try:
            message_id = redis_client.send_message(stream, source, maxlen=get_stream_maxlen())
        except Exception as exc:
            raise WebhookRedisError(f"Failed to write Redis stream {stream}: {type(exc).__name__}") from exc
        sent += 1
        message_ids.append(message_id)

    return WebhookResult(stream=stream, sent=sent, skipped=skipped, message_ids=message_ids)


def normalize_hit_value(value):
    if isinstance(value, dict):
        if set(value.keys()) == {"keyword"}:
            return normalize_hit_value(value.get("keyword"))
        return {key: normalize_hit_value(item) for key, item in value.items() if not str(key).endswith(".keyword")}
    if isinstance(value, list):
        return [normalize_hit_value(item) for item in value]
    return value


def extract_source(hit):
    if not isinstance(hit, dict):
        return {}
    source = hit.get("_source") if isinstance(hit.get("_source"), dict) else hit
    source = normalize_hit_value(source)
    return source if isinstance(source, dict) else {}


def _wazuh_nested(data, dotted_key, *path):
    if not isinstance(data, dict):
        return ""
    if dotted_key in data:
        return data.get(dotted_key) or ""
    current = data
    for part in path:
        if not isinstance(current, dict):
            return ""
        current = current.get(part, {})
    return current if not isinstance(current, dict) else ""


def _extract_wazuh_artifacts(host_name, host_ip, src_ip, dst_ip, user_name, process_name, command_line, parent_name, file_path, file_hash):
    specs = [
        (host_name, ArtifactType.HOSTNAME, ArtifactRole.AFFECTED, ArtifactName.AFFECTED_HOST),
        (host_ip, ArtifactType.IP_ADDRESS, ArtifactRole.AFFECTED, ArtifactName.HOST_IP),
        (src_ip, ArtifactType.IP_ADDRESS, ArtifactRole.ACTOR, ArtifactName.SOURCE_IP),
        (dst_ip, ArtifactType.IP_ADDRESS, ArtifactRole.TARGET, ArtifactName.DESTINATION_IP),
        (user_name, ArtifactType.USER_NAME, ArtifactRole.ACTOR, ArtifactName.SOURCE_USER),
        (process_name, ArtifactType.PROCESS_NAME, ArtifactRole.RELATED, ArtifactName.PROCESS_NAME),
        (command_line, ArtifactType.COMMAND_LINE, ArtifactRole.RELATED, ArtifactName.PROCESS_COMMAND_LINE),
        (parent_name, ArtifactType.PROCESS_NAME, ArtifactRole.RELATED, ArtifactName.PARENT_PROCESS_NAME),
        (file_path, ArtifactType.FILE_PATH, ArtifactRole.RELATED, ArtifactName.FILE_PATH),
        (file_hash, ArtifactType.HASH, ArtifactRole.RELATED, ArtifactName.FILE_HASH),
    ]
    return [
        {"value": str(value), "type": type_, "role": role, "name": name}
        for value, type_, role, name in specs
        if value
    ]


def ingest_wazuh_alert(raw_alert, *, schedule_analysis=True, trigger="wazuh_webhook"):
    if not isinstance(raw_alert, dict):
        raise ValueError("Wazuh alert must be a dict.")

    alert_data = raw_alert.get("alert") if isinstance(raw_alert.get("alert"), dict) else raw_alert

    rule = alert_data.get("rule") or {}
    rule_id = str(rule.get("id") or "wazuh-alert")
    rule_desc = rule.get("description") or f"Wazuh Alert rule {rule_id}"
    rule_level = int(rule.get("level") or 0)
    rule_groups = rule.get("groups") or []

    if rule_level >= 12:
        severity = Severity.CRITICAL
        risk_level = AlertRiskLevel.CRITICAL
        case_impact = CaseImpact.CRITICAL
        case_priority = CasePriority.CRITICAL
        impact = Impact.CRITICAL
    elif rule_level >= 8:
        severity = Severity.HIGH
        risk_level = AlertRiskLevel.HIGH
        case_impact = CaseImpact.HIGH
        case_priority = CasePriority.HIGH
        impact = Impact.HIGH
    elif rule_level >= 4:
        severity = Severity.MEDIUM
        risk_level = AlertRiskLevel.MEDIUM
        case_impact = CaseImpact.MEDIUM
        case_priority = CasePriority.MEDIUM
        impact = Impact.MEDIUM
    else:
        severity = Severity.LOW
        risk_level = AlertRiskLevel.LOW
        case_impact = CaseImpact.LOW
        case_priority = CasePriority.LOW
        impact = Impact.LOW

    mitre = rule.get("mitre") or {}
    mitre_ids = mitre.get("id", [])
    if isinstance(mitre_ids, str):
        mitre_ids = [mitre_ids]
    mitre_tactics = mitre.get("tactic", [])
    if isinstance(mitre_tactics, str):
        mitre_tactics = [mitre_tactics]
    mitre_techniques = mitre.get("technique", [])
    if isinstance(mitre_techniques, str):
        mitre_techniques = [mitre_techniques]

    primary_tactic = mitre_tactics[0] if mitre_tactics else "Security Alert"
    primary_technique = f"{mitre_ids[0]} - {mitre_techniques[0]}" if (mitre_ids and mitre_techniques) else (mitre_ids[0] if mitre_ids else rule_desc)

    agent = alert_data.get("agent") or {}
    agent_name = agent.get("name") or ""
    agent_ip = agent.get("ip") or ""
    agent_id = str(agent.get("id") or "")

    data = alert_data.get("data") or {}
    src_ip = data.get("srcip") or data.get("src_ip") or ""
    dst_ip = data.get("dstip") or data.get("dst_ip") or ""
    user_name = (
        data.get("dstuser")
        or data.get("srcuser")
        or _wazuh_nested(data, "win.eventdata.targetUserName", "win", "eventdata", "targetUserName")
        or _wazuh_nested(data, "win.eventdata.subjectUserName", "win", "eventdata", "subjectUserName")
        or ""
    )
    process_name = (
        data.get("process")
        or _wazuh_nested(data, "win.eventdata.image", "win", "eventdata", "image")
        or _wazuh_nested(data, "win.eventdata.processName", "win", "eventdata", "processName")
        or ""
    )
    command_line = (
        data.get("command")
        or _wazuh_nested(data, "win.eventdata.commandLine", "win", "eventdata", "commandLine")
        or ""
    )
    parent_name = _wazuh_nested(data, "win.eventdata.parentImage", "win", "eventdata", "parentImage") or ""
    file_path = (
        data.get("file_path")
        or _wazuh_nested(data, "win.eventdata.targetFilename", "win", "eventdata", "targetFilename")
        or ""
    )
    file_hash = (
        data.get("file_hash")
        or _wazuh_nested(data, "win.eventdata.hashes", "win", "eventdata", "hashes")
        or ""
    )

    event_time, time_unmapped = parse_event_time(alert_data.get("timestamp") or alert_data.get("@timestamp"))
    target_key = agent_name or agent_ip or "wazuh-agent"
    actor_key = user_name or src_ip or "external"
    correlation_uid = generate_correlation_uid(
        rule_id=f"wazuh-{rule_id}",
        time_window="24h",
        keys=[target_key, actor_key],
        timestamp=event_time,
    )

    artifacts = _extract_wazuh_artifacts(
        host_name=agent_name,
        host_ip=agent_ip,
        src_ip=src_ip,
        dst_ip=dst_ip,
        user_name=user_name,
        process_name=process_name,
        command_line=command_line,
        parent_name=parent_name,
        file_path=file_path,
        file_hash=file_hash,
    )

    unmapped = {
        **time_unmapped,
        "wazuh.agent.id": agent_id,
        "wazuh.rule.level": rule_level,
        "wazuh.rule.groups": rule_groups,
        "wazuh.location": alert_data.get("location") or "",
        "wazuh.full_log": alert_data.get("full_log") or "",
    }

    tags = ["wazuh", f"rule-{rule_id}", *mitre_ids, *rule_groups[:3]]
    tags = [str(t).lower() for t in tags if t]

    case_title = f"[Wazuh] {rule_desc} on {agent_name or 'host'}"
    if len(case_title) > 250:
        case_title = case_title[:247] + "..."

    alert_title = f"{rule_desc} ({agent_name or agent_ip or 'unknown'})"
    if len(alert_title) > 250:
        alert_title = alert_title[:247] + "..."

    return create_alert_with_context(
        case_defaults={
            "title": case_title,
            "severity": severity,
            "impact": case_impact,
            "priority": case_priority,
            "confidence": CaseConfidence.MEDIUM,
            "description": f"Wazuh alert detected: {rule_desc}. Log: {alert_data.get('full_log', '')}",
            "category": ProductCategory.SIEM,
            "tags": tags,
            "correlation_uid": correlation_uid,
        },
        alert_fields={
            "title": alert_title,
            "severity": severity,
            "confidence": Confidence.MEDIUM,
            "impact": impact,
            "disposition": Disposition.DETECTED,
            "action": AlertAction.OBSERVED,
            "status": AlertStatus.NEW,
            "status_detail": f"Wazuh Rule ID: {rule_id}, Level: {rule_level}",
            "rule_id": f"wazuh-{rule_id}",
            "rule_name": rule_desc,
            "correlation_uid": correlation_uid,
            "source_uid": str(alert_data.get("id") or ""),
            "analytic_type": AlertAnalyticType.RULE,
            "analytic_name": "Wazuh Rule Detection",
            "analytic_desc": rule_desc,
            "product_category": ProductCategory.SIEM,
            "product_name": "Wazuh",
            "product_vendor": "Wazuh",
            "product_feature": "Host & Security Monitoring",
            "first_seen_time": event_time,
            "last_seen_time": event_time,
            "desc": alert_data.get("full_log") or rule_desc,
            "data_sources": ["wazuh.alert"],
            "labels": tags,
            "raw_data": raw_alert,
            "unmapped": unmapped,
            "tactic": primary_tactic,
            "technique": primary_technique,
            "mitigation": "Review Wazuh alert details and verify host behavior.",
            "policy_type": AlertPolicyType.SECURITY_POLICY,
            "risk_level": risk_level,
        },
        artifacts=artifacts,
        enrichments=[],
        schedule_analysis=schedule_analysis,
        analysis_trigger=trigger,
    )


def handle_wazuh_webhook(payload, *, redis_client=None, direct_ingest=False):
    if not payload:
        raise ValueError("Payload cannot be empty.")

    alerts = payload if isinstance(payload, list) else [payload]
    stream = "WAZUH-ALERTS"
    redis_client = redis_client or RedisStreamClient()
    sent = 0
    skipped = 0
    message_ids = []

    for alert_item in alerts:
        if not isinstance(alert_item, dict):
            skipped += 1
            continue

        raw_alert = alert_item.get("alert") if isinstance(alert_item.get("alert"), dict) else alert_item

        if direct_ingest:
            ingest_wazuh_alert(raw_alert, schedule_analysis=True, trigger="wazuh_direct")
            sent += 1
            message_ids.append(f"direct-{sent}")
        else:
            try:
                message_id = redis_client.send_message(stream, raw_alert, maxlen=get_stream_maxlen())
                message_ids.append(message_id)
                sent += 1
            except Exception as exc:
                raise WebhookRedisError(f"Failed to write Redis stream {stream}: {type(exc).__name__}") from exc

    return WebhookResult(stream=stream, sent=sent, skipped=skipped, message_ids=message_ids)
