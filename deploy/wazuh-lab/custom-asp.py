#!/usr/bin/env python3
"""
Wazuh Custom Integration Script for Agentic SOC Platform (ASP)
Place this script in /var/ossec/integrations/custom-asp on Wazuh Manager.
Make executable: chmod +x /var/ossec/integrations/custom-asp
"""

import json
import sys
import urllib.request
import urllib.error

def main():
    if len(sys.argv) < 2:
        sys.exit(1)

    alert_file = sys.argv[1]
    hook_url = sys.argv[3] if len(sys.argv) > 3 else "http://host.docker.internal:8000/api/webhook/wazuh/"

    try:
        with open(alert_file, "r", encoding="utf-8") as f:
            alert_json = json.load(f)
    except Exception as exc:
        sys.stderr.write(f"Error reading alert file: {exc}\n")
        sys.exit(1)

    payload = json.dumps(alert_json).encode("utf-8")
    req = urllib.request.Request(
        hook_url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "Wazuh-Integration/1.0"},
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.getcode()
            if status >= 400:
                sys.stderr.write(f"Failed to send alert to ASP: HTTP {status}\n")
                sys.exit(1)
    except urllib.error.URLError as exc:
        sys.stderr.write(f"Connection error to ASP webhook {hook_url}: {exc}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()

