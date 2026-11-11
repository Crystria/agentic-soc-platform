#!/usr/bin/env python3
"""
Simulate and replay Wazuh alerts to Agentic SOC Platform (ASP) webhook.
Usage:
    python simulate_wazuh_alerts.py --url http://127.0.0.1:8000/api/webhook/wazuh/?direct=true
    python simulate_wazuh_alerts.py --scenario brute_force
    python simulate_wazuh_alerts.py --list
"""

import argparse
import json
from pathlib import Path
import sys
import urllib.request
import urllib.error

BENCHMARK_FILE = Path(__file__).resolve().parent.parent.parent / "backend" / "benchmark" / "scenarios_15_ground_truth.json"

def load_scenarios():
    if not BENCHMARK_FILE.exists():
        print(f"Error: Scenarios file not found at {BENCHMARK_FILE}")
        sys.exit(1)
    with open(BENCHMARK_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def send_alert(url, alert_data):
    payload = json.dumps(alert_data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "ASP-Wazuh-Simulator/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            status = resp.getcode()
            body = resp.read().decode("utf-8")
            return status, body
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8")
    except Exception as exc:
        return 0, str(exc)

def main():
    parser = argparse.ArgumentParser(description="Simulate Wazuh Alerts to ASP Webhook")
    parser.add_argument("--url", default="http://127.0.0.1:8000/api/webhook/wazuh/?direct=true", help="ASP Wazuh Webhook URL")
    parser.add_argument("--scenario", help="Scenario ID to send (or 'all' to send all 15)")
    parser.add_argument("--list", action="store_true", help="List available scenarios")
    args = parser.parse_args()

    scenarios = load_scenarios()

    if args.list:
        print("\n=== Available Benchmark Scenarios (15 Scenarios) ===")
        for sc in scenarios:
            mitre_id = sc.get("ground_truth", {}).get("mitre_technique_id", "N/A")
            mitre_name = sc.get("ground_truth", {}).get("mitre_technique_name", "")
            mitre = f"{mitre_id} ({mitre_name})" if mitre_name else mitre_id
            verdict = sc.get("ground_truth", {}).get("expected_verdict", "N/A")
            print(f"[{sc['id']}] {sc['name']} | MITRE: {mitre} | Verdict: {verdict}")
        print()
        return

    targets = []
    if args.scenario and args.scenario.lower() != "all":
        found = [sc for sc in scenarios if sc["id"] == args.scenario]
        if not found:
            print(f"Error: Scenario '{args.scenario}' not found. Use --list to see options.")
            sys.exit(1)
        targets = found
    else:
        targets = scenarios

    print(f"Sending {len(targets)} alert(s) to {args.url} ...\n")
    success_count = 0
    for sc in targets:
        print(f"-> Sending [{sc['id']}]: {sc['name']} ... ", end="", flush=True)
        status, response = send_alert(args.url, sc["wazuh_alert"])
        if status in (200, 201):
            print(f"SUCCESS (HTTP {status})")
            success_count += 1
        else:
            print(f"FAILED (Status: {status}) - {response}")

    print(f"\nDone: {success_count}/{len(targets)} alerts successfully sent.")

if __name__ == "__main__":
    main()
