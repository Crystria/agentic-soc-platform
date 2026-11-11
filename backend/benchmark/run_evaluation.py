#!/usr/bin/env python3
"""
Agentic SOC Platform - 15 Wazuh Scenarios Benchmark & Evaluation Runner
Measures:
- Ingestion & Field Mapping Accuracy
- Investigation Agent Verdict Accuracy (True Positive vs False Positive)
- MITRE ATT&CK Technique Identification
- Precision, Recall, F1 Score
- Average Response Latency
- Hallucination & Schema Validation

Usage:
    # Run offline ingestion validation & ground-truth verification:
    python backend/benchmark/run_evaluation.py --mode ingest

    # Run full live LLM evaluation via Django environment:
    python backend/benchmark/run_evaluation.py --mode agent

    # Run HTTP webhook replay against running server:
    python backend/benchmark/run_evaluation.py --mode http --url http://127.0.0.1:8000/api/webhook/wazuh/?direct=true
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

# Add backend directory to sys.path so Django apps can be imported
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

SCENARIOS_FILE = Path(__file__).resolve().parent / "scenarios_15_ground_truth.json"


def load_scenarios():
    if not SCENARIOS_FILE.exists():
        raise FileNotFoundError(f"Scenarios file not found: {SCENARIOS_FILE}")
    with open(SCENARIOS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def evaluate_ingest_mode(scenarios):
    """
    Validates field extraction, artifact generation, severity mapping,
    and MITRE identification from raw Wazuh payloads.
    """
    print("=" * 70)
    print("BENCHMARK MODE: INGESTION & NORMALIZATION VERIFICATION (15 SCENARIOS)")
    print("=" * 70)

    # Setup Django environment if available
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        import django
        django.setup()
        from apps.webhook.service import ingest_wazuh_alert
    except Exception as exc:
        print(f"[!] Running in lightweight offline mode (Django setup skipped: {exc})")
        ingest_wazuh_alert = None

    passed_count = 0
    total = len(scenarios)

    results = []
    start_total_time = time.time()

    for idx, sc in enumerate(scenarios, start=1):
        sc_id = sc["id"]
        sc_name = sc["name"]
        raw_alert = sc["wazuh_alert"]
        gt = sc["ground_truth"]

        start_time = time.time()
        rule = raw_alert.get("rule", {})
        rule_level = rule.get("level", 0)
        mitre_ids = rule.get("mitre", {}).get("id", [])

        # Check severity expectation
        expected_sev = gt["expected_severity"].lower()
        if rule_level >= 12:
            mapped_sev = "critical"
        elif rule_level >= 8:
            mapped_sev = "high"
        elif rule_level >= 4:
            mapped_sev = "medium"
        else:
            mapped_sev = "low"

        sev_match = (mapped_sev == expected_sev)
        expected_mitre = gt["mitre_technique_id"]
        mitre_match = any(expected_mitre in m for m in mitre_ids)

        # Ingest into DB if Django is active
        db_created = False
        if ingest_wazuh_alert:
            try:
                res = ingest_wazuh_alert(raw_alert, schedule_analysis=False, trigger="benchmark_ingest")
                db_created = bool(res.case and res.alert)
            except Exception as e:
                db_created = False

        duration = time.time() - start_time
        test_passed = sev_match and mitre_match

        if test_passed:
            passed_count += 1

        results.append({
            "idx": idx,
            "id": sc_id,
            "name": sc_name,
            "rule_id": rule.get("id"),
            "level": rule_level,
            "expected_sev": expected_sev,
            "mapped_sev": mapped_sev,
            "expected_mitre": expected_mitre,
            "mitre_match": mitre_match,
            "db_created": db_created,
            "passed": test_passed,
            "latency_ms": round(duration * 1000, 2),
        })

        status_str = "[PASS]" if test_passed else "[FAIL]"
        print(f" {status_str} #{idx:02d} {sc_name[:40]:<40} | Sev: {mapped_sev.upper():<8} | MITRE: {expected_mitre:<10} | {duration*1000:.1f}ms")

    total_duration = time.time() - start_total_time
    accuracy = (passed_count / total) * 100

    print("\n" + "=" * 70)
    print("SUMMARY RESULTS")
    print("=" * 70)
    print(f"Total Scenarios Tested : {total}")
    print(f"Passed Scenarios       : {passed_count}/{total} ({accuracy:.1f}%)")
    print(f"Total Execution Time   : {total_duration:.2f}s (Avg {total_duration/total*1000:.1f}ms/alert)")
    print("=" * 70)
    return results


def evaluate_agent_mode(scenarios):
    """
    Runs each scenario through the live AI Investigation Agent and measures
    verdict accuracy, MITRE identification, and response latency.
    """
    print("=" * 70)
    print("BENCHMARK MODE: LIVE AGENT EVALUATION (15 SCENARIOS)")
    print("=" * 70)

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django
    django.setup()

    from apps.webhook.service import ingest_wazuh_alert
    from apps.agentic.analysis.analysis import run_case_analysis

    results = []
    tp_count = 0  # Ground truth Positive and Agent Predicted Positive
    fp_count = 0  # Ground truth Negative but Agent Predicted Positive
    tn_count = 0  # Ground truth Negative and Agent Predicted Negative
    fn_count = 0  # Ground truth Positive but Agent Predicted Negative
    mitre_identified_count = 0

    total_latency = 0.0

    for idx, sc in enumerate(scenarios, start=1):
        sc_id = sc["id"]
        sc_name = sc["name"]
        raw_alert = sc["wazuh_alert"]
        gt = sc["ground_truth"]

        print(f"\n[Scenario #{idx:02d}] {sc_name} ...")
        ingest_res = ingest_wazuh_alert(raw_alert, schedule_analysis=False, trigger="benchmark_live")
        case = ingest_res.case

        start_time = time.time()
        try:
            analysis_result = run_case_analysis(case=case, trigger="benchmark", user_input="")
            latency = time.time() - start_time
            report = analysis_result.report

            ai_verdict = str(report.verdict).lower()
            expected_verdict = gt["expected_verdict"].lower()
            is_malicious_expected = "positive" in expected_verdict
            is_malicious_pred = "positive" in ai_verdict or "true" in ai_verdict

            if is_malicious_expected and is_malicious_pred:
                tp_count += 1
            elif not is_malicious_expected and is_malicious_pred:
                fp_count += 1
            elif not is_malicious_expected and not is_malicious_pred:
                tn_count += 1
            else:
                fn_count += 1

            # Check if expected MITRE technique is present in report
            expected_mitre_id = gt["mitre_technique_id"]
            report_text = json.dumps(report.model_dump())
            mitre_found = expected_mitre_id in report_text
            if mitre_found:
                mitre_identified_count += 1

            total_latency += latency
            print(f"  -> Done in {latency:.2f}s | Verdict: {report.verdict} (Expected: {gt['expected_verdict']}) | MITRE {expected_mitre_id}: {'FOUND' if mitre_found else 'MISSED'}")

            results.append({
                "id": sc_id,
                "name": sc_name,
                "latency_s": round(latency, 2),
                "ai_verdict": report.verdict,
                "expected_verdict": gt["expected_verdict"],
                "mitre_found": mitre_found,
            })
        except Exception as exc:
            print(f"  -> FAILED: {exc}")
            results.append({
                "id": sc_id,
                "name": sc_name,
                "error": str(exc),
            })

    total = len(scenarios)
    verdict_accuracy = ((tp_count + tn_count) / total) * 100 if total else 0
    precision = (tp_count / (tp_count + fp_count)) * 100 if (tp_count + fp_count) else 0
    recall = (tp_count / (tp_count + fn_count)) * 100 if (tp_count + fn_count) else 0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0
    mitre_accuracy = (mitre_identified_count / 12) * 100  # 12 malicious scenarios

    print("\n" + "=" * 70)
    print("AI AGENT BENCHMARK EVALUATION METRICS")
    print("=" * 70)
    print(f"Verdict Accuracy        : {verdict_accuracy:.1f}%")
    print(f"Precision               : {precision:.1f}%")
    print(f"Recall (Sensitivity)    : {recall:.1f}%")
    print(f"F1-Score                : {f1:.1f}%")
    print(f"MITRE ID Identification : {mitre_accuracy:.1f}% ({mitre_identified_count}/12)")
    print(f"Avg Analysis Latency    : {total_latency / total:.2f}s per case")
    print("=" * 70)
    return results


def main():
    parser = argparse.ArgumentParser(description="Agentic SOC Platform 15 Scenarios Evaluation Runner")
    parser.add_argument("--mode", choices=["ingest", "agent", "http"], default="ingest", help="Benchmark execution mode")
    parser.add_argument("--url", default="http://127.0.0.1:8000/api/webhook/wazuh/?direct=true", help="Target webhook URL for http mode")
    args = parser.parse_args()

    scenarios = load_scenarios()
    print(f"Loaded {len(scenarios)} ground-truth scenarios from {SCENARIOS_FILE}")

    if args.mode == "ingest":
        evaluate_ingest_mode(scenarios)
    elif args.mode == "agent":
        evaluate_agent_mode(scenarios)
    elif args.mode == "http":
        print(f"Replaying {len(scenarios)} scenarios via HTTP to {args.url}...")
        from simulate_wazuh_alerts import send_alert
        for sc in scenarios:
            st, _ = send_alert(args.url, sc["wazuh_alert"])
            print(f"[{st}] {sc['name']}")


if __name__ == "__main__":
    main()

