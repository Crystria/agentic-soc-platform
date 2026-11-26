from apps.agentic.runtime.base import generate_correlation_uid, parse_event_time
from apps.agentic.services.alerts import create_alert_with_context
from apps.alerts.models import (
    AlertAction,
    AlertAnalyticType,
    AlertPolicyType,
    AlertRiskLevel,
    AlertStatus,
    AlertTactic,
    Confidence,
    Disposition,
    Impact,
    ProductCategory,
    Severity,
)
from apps.artifacts.models import ArtifactName, ArtifactRole, ArtifactType
from apps.cases.models import CaseCategory, CaseConfidence, CaseImpact, CasePriority, CaseSeverity
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


def _nested_value(data, dotted_key, *path):
    if not isinstance(data, dict):
        return ""
    if dotted_key in data:
        return data.get(dotted_key) or ""
    parts = path or tuple(dotted_key.split("."))
    current = data
    for part in parts:
        if not isinstance(current, dict):
            return ""
        current = current.get(part, {})
    return current if not isinstance(current, dict) else ""


def _first_scalar(value):
    if isinstance(value, list):
        for item in value:
            scalar = _first_scalar(item)
            if scalar:
                return scalar
        return ""
    if value in (None, ""):
        return ""
    return str(value)


_TACTIC_MAP = {
    **{member.value.casefold(): member.value for member in AlertTactic},
    "command & control": AlertTactic.COMMAND_AND_CONTROL.value,
}


def _resolve_tactic(mitre_tactics):
    """Map raw MITRE tactic names to valid AlertTactic choices."""
    for tactic in mitre_tactics or []:
        normalized = str(tactic or "").strip().casefold()
        if normalized in _TACTIC_MAP:
            return _TACTIC_MAP[normalized]
    return ""


def _build_common_artifacts(
    *,
    host_name="",
    host_ip="",
    src_ip="",
    dst_ip="",
    user_name="",
    process_name="",
    command_line="",
    parent_name="",
    file_path="",
    file_hash="",
    url_value="",
):
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
        (url_value, ArtifactType.URL_STRING, ArtifactRole.RELATED, ArtifactName.URL),
    ]
    return [
        {"value": str(value)[:500], "type": type_, "role": role, "name": name}
        for value, type_, role, name in specs
        if value
    ]


_SEVERITY_LEVEL_BUNDLE = {
    "critical": (Severity.CRITICAL, CaseSeverity.CRITICAL, AlertRiskLevel.CRITICAL, CaseImpact.CRITICAL, CasePriority.CRITICAL, Impact.CRITICAL),
    "high": (Severity.HIGH, CaseSeverity.HIGH, AlertRiskLevel.HIGH, CaseImpact.HIGH, CasePriority.HIGH, Impact.HIGH),
    "medium": (Severity.MEDIUM, CaseSeverity.MEDIUM, AlertRiskLevel.MEDIUM, CaseImpact.MEDIUM, CasePriority.MEDIUM, Impact.MEDIUM),
    "low": (Severity.LOW, CaseSeverity.LOW, AlertRiskLevel.LOW, CaseImpact.LOW, CasePriority.LOW, Impact.LOW),
}


def _map_elastic_severity(raw_severity, risk_score):
    normalized = str(raw_severity or "").strip().casefold()
    if normalized in _SEVERITY_LEVEL_BUNDLE:
        return _SEVERITY_LEVEL_BUNDLE[normalized]
    try:
        score = float(risk_score)
    except (TypeError, ValueError):
        score = 0.0
    if score >= 85:
        return _SEVERITY_LEVEL_BUNDLE["critical"]
    if score >= 60:
        return _SEVERITY_LEVEL_BUNDLE["high"]
    if score >= 30:
        return _SEVERITY_LEVEL_BUNDLE["medium"]
    return _SEVERITY_LEVEL_BUNDLE["low"]


def _extract_elastic_mitre(raw_alert):
    threats = (
        _nested_value(raw_alert, "kibana.alert.rule.threat")
        or _nested_value(raw_alert, "signal.rule.threat")
        or _nested_value(raw_alert, "threat")
        or []
    )
    if isinstance(threats, dict):
        threats = [threats]
    tactics = []
    tech_ids = []
    tech_names = []
    for threat in threats if isinstance(threats, list) else []:
        if not isinstance(threat, dict):
            continue
        tactic = threat.get("tactic")
        if isinstance(tactic, dict) and tactic.get("name"):
            tactics.append(tactic["name"])
        elif isinstance(tactic, str) and tactic:
            tactics.append(tactic)
        techniques = threat.get("technique") or []
        if isinstance(techniques, dict):
            techniques = [techniques]
        for tech in techniques if isinstance(techniques, list) else []:
            if not isinstance(tech, dict):
                continue
            if tech.get("id"):
                tech_ids.append(str(tech["id"]))
            if tech.get("name"):
                tech_names.append(str(tech["name"]))
    return tactics, tech_ids, tech_names


def ingest_elastic_security_alert(raw_alert, *, schedule_analysis=True, trigger="ELASTIC-SECURITY-ALERTS"):
    """Normalize an Elastic Security alert document (ECS) into Case, Alert, and Artifacts."""
    if not isinstance(raw_alert, dict):
        raise ValueError("Elastic Security alert must be a dict.")

    rule_name = (
        _first_scalar(_nested_value(raw_alert, "kibana.alert.rule.name"))
        or _first_scalar(_nested_value(raw_alert, "signal.rule.name"))
        or _first_scalar(_nested_value(raw_alert, "rule.name"))
        or "Elastic Security Alert"
    )
    rule_id = (
        _first_scalar(_nested_value(raw_alert, "kibana.alert.rule.rule_id"))
        or _first_scalar(_nested_value(raw_alert, "kibana.alert.rule.id"))
        or _first_scalar(_nested_value(raw_alert, "signal.rule.id"))
        or _first_scalar(_nested_value(raw_alert, "rule.id"))
        or "elastic-alert"
    )
    rule_desc = (
        _first_scalar(_nested_value(raw_alert, "kibana.alert.reason"))
        or _first_scalar(_nested_value(raw_alert, "kibana.alert.rule.description"))
        or _first_scalar(_nested_value(raw_alert, "signal.rule.description"))
        or _first_scalar(_nested_value(raw_alert, "message"))
        or rule_name
    )
    raw_severity = (
        _first_scalar(_nested_value(raw_alert, "kibana.alert.severity"))
        or _first_scalar(_nested_value(raw_alert, "signal.rule.severity"))
        or _first_scalar(_nested_value(raw_alert, "event.severity_label"))
    )
    risk_score = (
        _nested_value(raw_alert, "kibana.alert.risk_score")
        or _nested_value(raw_alert, "signal.rule.risk_score")
        or _nested_value(raw_alert, "event.risk_score")
        or 0
    )
    severity, case_severity, risk_level, case_impact, case_priority, impact = _map_elastic_severity(
        raw_severity, risk_score
    )

    tactics, mitre_ids, mitre_names = _extract_elastic_mitre(raw_alert)
    primary_tactic = _resolve_tactic(tactics)
    primary_technique = (
        f"{mitre_ids[0]} - {mitre_names[0]}"
        if (mitre_ids and mitre_names)
        else (mitre_ids[0] if mitre_ids else rule_name)
    )

    host_name = _first_scalar(
        _nested_value(raw_alert, "host.name")
        or _nested_value(raw_alert, "host.hostname")
        or _nested_value(raw_alert, "agent.name")
    )
    host_ip = _first_scalar(_nested_value(raw_alert, "host.ip"))
    src_ip = _first_scalar(
        _nested_value(raw_alert, "source.ip") or _nested_value(raw_alert, "client.ip")
    )
    dst_ip = _first_scalar(
        _nested_value(raw_alert, "destination.ip") or _nested_value(raw_alert, "server.ip")
    )
    user_name = _first_scalar(
        _nested_value(raw_alert, "user.name")
        or _nested_value(raw_alert, "winlog.event_data.TargetUserName")
        or _nested_value(raw_alert, "winlog.event_data.SubjectUserName")
    )
    process_name = _first_scalar(
        _nested_value(raw_alert, "process.name") or _nested_value(raw_alert, "process.executable")
    )
    command_line = _first_scalar(_nested_value(raw_alert, "process.command_line"))
    parent_name = _first_scalar(
        _nested_value(raw_alert, "process.parent.name")
        or _nested_value(raw_alert, "process.parent.executable")
    )
    file_path = _first_scalar(_nested_value(raw_alert, "file.path"))
    file_hash = _first_scalar(
        _nested_value(raw_alert, "file.hash.sha256")
        or _nested_value(raw_alert, "process.hash.sha256")
        or _nested_value(raw_alert, "file.hash.md5")
    )
    url_value = _first_scalar(
        _nested_value(raw_alert, "url.full") or _nested_value(raw_alert, "url.original")
    )

    event_time, time_unmapped = parse_event_time(
        _nested_value(raw_alert, "@timestamp") or _nested_value(raw_alert, "event.ingested")
    )
    target_key = host_name or host_ip or "elastic-host"
    actor_key = user_name or src_ip or process_name or "external"
    correlation_uid = generate_correlation_uid(
        rule_id=f"elastic-{rule_id}",
        time_window="24h",
        keys=[target_key, actor_key],
        timestamp=event_time,
    )

    artifacts = _build_common_artifacts(
        host_name=host_name,
        host_ip=host_ip,
        src_ip=src_ip,
        dst_ip=dst_ip,
        user_name=user_name,
        process_name=process_name,
        command_line=command_line,
        parent_name=parent_name,
        file_path=file_path,
        file_hash=file_hash,
        url_value=url_value,
    )

    event_module = _first_scalar(_nested_value(raw_alert, "event.module"))
    agent_type = _first_scalar(_nested_value(raw_alert, "agent.type"))
    if event_module in {"endpoint", "sysmon"} or agent_type == "endpoint":
        product_category = ProductCategory.EDR
        case_category = CaseCategory.EDR
    elif event_module in {"suricata", "zeek", "firewall"}:
        product_category = ProductCategory.NDR
        case_category = CaseCategory.NDR
    else:
        product_category = ProductCategory.SIEM
        case_category = CaseCategory.SIEM

    raw_tags = _nested_value(raw_alert, "kibana.alert.rule.tags") or _nested_value(raw_alert, "tags") or []
    if isinstance(raw_tags, str):
        raw_tags = [raw_tags]
    tags = [str(t).lower() for t in ["elastic", *mitre_ids, *(raw_tags[:4] if isinstance(raw_tags, list) else [])] if t]

    case_title = f"[Elastic] {rule_name} on {host_name or 'host'}"
    if len(case_title) > 250:
        case_title = case_title[:247] + "..."

    alert_title = f"{rule_name} ({host_name or host_ip or 'unknown'})"
    if len(alert_title) > 250:
        alert_title = alert_title[:247] + "..."

    source_uid = _first_scalar(
        _nested_value(raw_alert, "kibana.alert.uuid")
        or _nested_value(raw_alert, "event.id")
        or _nested_value(raw_alert, "_id")
    )

    unmapped = {
        **time_unmapped,
        "elastic.alert.severity": raw_severity,
        "elastic.alert.risk_score": risk_score,
        "elastic.event.module": event_module,
        "elastic.event.dataset": _first_scalar(_nested_value(raw_alert, "event.dataset")),
        "elastic.winlog.event_id": _first_scalar(_nested_value(raw_alert, "winlog.event_id")),
    }

    return create_alert_with_context(
        case_defaults={
            "title": case_title,
            "severity": case_severity,
            "impact": case_impact,
            "priority": case_priority,
            "confidence": CaseConfidence.MEDIUM,
            "description": rule_desc,
            "category": case_category,
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
            "status_detail": f"Elastic Rule ID: {rule_id}, Risk Score: {risk_score}",
            "rule_id": f"elastic-{rule_id}"[:255],
            "rule_name": rule_name[:255],
            "correlation_uid": correlation_uid[:255],
            "source_uid": source_uid[:255],
            "analytic_type": AlertAnalyticType.RULE,
            "analytic_name": "Elastic Security Detection Rule",
            "analytic_desc": rule_desc,
            "product_category": product_category,
            "product_name": "Elastic Security",
            "product_vendor": "Elastic",
            "product_feature": event_module or "SIEM Detection",
            "first_seen_time": event_time,
            "last_seen_time": event_time,
            "desc": rule_desc,
            "data_sources": [source for source in ["elastic.alert", event_module] if source],
            "labels": tags,
            "raw_data": raw_alert,
            "unmapped": unmapped,
            "tactic": primary_tactic,
            "technique": str(primary_technique)[:100],
            "mitigation": "Review Elastic Security alert details and verify host/user activity.",
            "policy_type": AlertPolicyType.OTHER,
            "risk_level": risk_level,
        },
        artifacts=artifacts,
        enrichments=[],
        schedule_analysis=schedule_analysis,
        analysis_trigger=trigger,
    )


def ingest_wazuh_alert(raw_alert, *, schedule_analysis=True, trigger="wazuh_webhook"):
    if not isinstance(raw_alert, dict):
        raise ValueError("Wazuh alert must be a dict.")

    alert_data = raw_alert.get("alert") if isinstance(raw_alert.get("alert"), dict) else raw_alert

    rule = alert_data.get("rule") or {}
    rule_id = str(rule.get("id") or "wazuh-alert")
    rule_desc = str(rule.get("description") or f"Wazuh Alert rule {rule_id}")
    rule_level = int(rule.get("level") or 0)
    rule_groups = rule.get("groups") or []

    if rule_level >= 12:
        severity = Severity.CRITICAL
        case_severity = CaseSeverity.CRITICAL
        risk_level = AlertRiskLevel.CRITICAL
        case_impact = CaseImpact.CRITICAL
        case_priority = CasePriority.CRITICAL
        impact = Impact.CRITICAL
    elif rule_level >= 8:
        severity = Severity.HIGH
        case_severity = CaseSeverity.HIGH
        risk_level = AlertRiskLevel.HIGH
        case_impact = CaseImpact.HIGH
        case_priority = CasePriority.HIGH
        impact = Impact.HIGH
    elif rule_level >= 4:
        severity = Severity.MEDIUM
        case_severity = CaseSeverity.MEDIUM
        risk_level = AlertRiskLevel.MEDIUM
        case_impact = CaseImpact.MEDIUM
        case_priority = CasePriority.MEDIUM
        impact = Impact.MEDIUM
    else:
        severity = Severity.LOW
        case_severity = CaseSeverity.LOW
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

    primary_tactic = _resolve_tactic(mitre_tactics)
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
        or _nested_value(data, "win.eventdata.targetUserName", "win", "eventdata", "targetUserName")
        or _nested_value(data, "win.eventdata.subjectUserName", "win", "eventdata", "subjectUserName")
        or ""
    )
    process_name = (
        data.get("process")
        or _nested_value(data, "win.eventdata.image", "win", "eventdata", "image")
        or _nested_value(data, "win.eventdata.processName", "win", "eventdata", "processName")
        or ""
    )
    command_line = (
        data.get("command")
        or _nested_value(data, "win.eventdata.commandLine", "win", "eventdata", "commandLine")
        or ""
    )
    parent_name = _nested_value(data, "win.eventdata.parentImage", "win", "eventdata", "parentImage") or ""
    file_path = (
        data.get("file_path")
        or _nested_value(data, "win.eventdata.targetFilename", "win", "eventdata", "targetFilename")
        or ""
    )
    file_hash = (
        data.get("file_hash")
        or _nested_value(data, "win.eventdata.hashes", "win", "eventdata", "hashes")
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

    artifacts = _build_common_artifacts(
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
            "severity": case_severity,
            "impact": case_impact,
            "priority": case_priority,
            "confidence": CaseConfidence.MEDIUM,
            "description": f"Wazuh alert detected: {rule_desc}. Log: {alert_data.get('full_log', '')}",
            "category": CaseCategory.SIEM,
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
            "rule_id": f"wazuh-{rule_id}"[:255],
            "rule_name": rule_desc[:255],
            "correlation_uid": correlation_uid[:255],
            "source_uid": str(alert_data.get("id") or "")[:255],
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
            "technique": str(primary_technique)[:100],
            "mitigation": "Review Wazuh alert details and verify host behavior.",
            "policy_type": AlertPolicyType.OTHER,
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
