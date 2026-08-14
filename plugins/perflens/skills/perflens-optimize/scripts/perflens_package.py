#!/usr/bin/env python3
"""Inspect PerfLens audit packages and create compatible Fix Sessions."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MAX_BYTES = 8 * 1024 * 1024
PLUGIN_VERSION = "0.1.0"
SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


class PackageError(ValueError):
    pass


def load_package(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise PackageError(f"Report does not exist: {path}")
    if path.stat().st_size > MAX_BYTES:
        raise PackageError(f"Report exceeds {MAX_BYTES // (1024 * 1024)} MiB limit")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PackageError(f"Report is not valid UTF-8 JSON: {exc}") from exc
    errors: list[str] = []
    if not isinstance(value, dict):
        errors.append("root must be an object")
        value = {}
    elif value.get("schema") != "perflens.audit-package":
        errors.append("schema must be perflens.audit-package")
    version = str(value.get("schemaVersion", ""))
    if version.split(".")[0] != "1":
        errors.append(f"unsupported schema major version: {version or 'missing'}")
    evidence = value.get("evidence")
    if not isinstance(evidence, dict) or not isinstance(evidence.get("snapshot"), dict):
        errors.append("evidence.snapshot must be an object")
    if not isinstance(evidence, dict) or not isinstance(evidence.get("audits"), list):
        errors.append("evidence.audits must be an array")
    if not value.get("reportId"):
        errors.append("reportId is required")
    if errors:
        raise PackageError("; ".join(errors))
    return value


def metric(snapshot: dict[str, Any], group: str, key: str) -> Any:
    value = snapshot.get(group, {})
    return value.get(key) if isinstance(value, dict) else None


def report_summary(report: dict[str, Any]) -> dict[str, Any]:
    evidence = report["evidence"]
    snapshot = evidence["snapshot"]
    page = snapshot.get("page", {}) if isinstance(snapshot.get("page"), dict) else {}
    plan = report.get("optimizationPlan")
    findings = plan.get("findings", []) if isinstance(plan, dict) else []
    ordered = sorted(
        (item for item in findings if isinstance(item, dict)),
        key=lambda item: SEVERITY_ORDER.get(str(item.get("severity", "medium")), 2),
    )
    return {
        "schemaVersion": report.get("schemaVersion"),
        "reportId": report.get("reportId"),
        "page": {"title": page.get("title"), "url": page.get("url"), "measuredAt": page.get("measuredAt")},
        "metrics": {
            "lcpMs": metric(snapshot, "timing", "lcp"),
            "inpMs": metric(snapshot, "timing", "inp"),
            "cls": metric(snapshot, "timing", "cls"),
            "ttfbMs": metric(snapshot, "timing", "ttfb"),
            "totalBlockingTimeMs": metric(snapshot, "runtime", "totalBlockingTime"),
        },
        "auditCount": len(evidence["audits"]),
        "hasOptimizationPlan": isinstance(plan, dict),
        "findings": [
            {
                "id": item.get("id"),
                "severity": item.get("severity"),
                "title": item.get("title"),
                "confidence": item.get("confidence"),
                "actions": [
                    {
                        "priority": action.get("priority"),
                        "title": action.get("title"),
                        "targetHints": action.get("targetHints", []),
                        "acceptanceChecks": action.get("acceptanceChecks", []),
                    }
                    for action in item.get("actions", [])
                    if isinstance(action, dict)
                ],
            }
            for item in ordered
        ],
    }


def print_human(summary: dict[str, Any]) -> None:
    page = summary["page"]
    metrics = summary["metrics"]
    print(f"PerfLens report {summary['reportId']} (schema {summary['schemaVersion']})")
    print(f"Page: {page.get('title') or 'untitled'} — {page.get('url') or 'URL unavailable'}")
    print(
        "Metrics: "
        f"LCP={metrics['lcpMs']}ms, INP={metrics['inpMs']}ms, CLS={metrics['cls']}, "
        f"TTFB={metrics['ttfbMs']}ms, TBT={metrics['totalBlockingTimeMs']}ms"
    )
    print(f"Audits: {summary['auditCount']}; optimization plan: {'yes' if summary['hasOptimizationPlan'] else 'no'}")
    for finding in summary["findings"]:
        print(f"- {str(finding.get('severity') or 'medium').upper()} {finding.get('id')}: {finding.get('title')}")
        for action in finding["actions"]:
            hints = ", ".join(str(item) for item in action["targetHints"]) or "no target hints"
            print(f"  - {action.get('priority') or 'P1'} {action.get('title')}: {hints}")


def parse_change(value: str) -> dict[str, Any]:
    parts = value.split("|", 2)
    if len(parts) < 2 or not parts[0].strip() or not parts[1].strip():
        raise PackageError("--change must be 'relative/file|reason|finding-1,finding-2'")
    return {
        "file": parts[0].strip().replace("\\", "/"),
        "reason": parts[1].strip(),
        "findingIds": [item.strip() for item in parts[2].split(",") if item.strip()] if len(parts) == 3 else [],
    }


def parse_check(value: str) -> dict[str, str]:
    parts = value.split("|", 2)
    if len(parts) < 2 or parts[1].strip().lower() not in {"passed", "failed", "skipped"}:
        raise PackageError("--check must be 'command|passed|failed|skipped|details'")
    return {
        "command": parts[0].strip(),
        "status": parts[1].strip().lower(),
        "details": parts[2].strip() if len(parts) == 3 else "",
    }


def safe_workspace_file(workspace: Path, relative: str) -> Path:
    candidate = (workspace / relative).resolve()
    root = workspace.resolve()
    if candidate != root and root not in candidate.parents:
        raise PackageError(f"Change points outside workspace: {relative}")
    if not candidate.is_file():
        raise PackageError(f"Changed file does not exist: {relative}")
    return candidate


def create_session(args: argparse.Namespace) -> dict[str, Any]:
    report = load_package(args.report)
    workspace = args.workspace.resolve()
    changes = []
    for raw in args.change:
        change = parse_change(raw)
        file_path = safe_workspace_file(workspace, change["file"])
        change["sha256"] = hashlib.sha256(file_path.read_bytes()).hexdigest()
        changes.append(change)
    checks = [parse_check(raw) for raw in args.check]
    return {
        "schema": "perflens.fix-session",
        "schemaVersion": "1.0.0",
        "version": "1.0",
        "reportId": report["reportId"],
        "appliedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": {"product": "PerfLens Codex", "productVersion": PLUGIN_VERSION},
        "summary": args.summary,
        "changes": changes,
        "verification": checks,
        "suggestedCommands": args.suggested_command,
        "requiresBrowserRecapture": True,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    inspect_parser = subparsers.add_parser("inspect", help="Validate and summarize an audit package")
    inspect_parser.add_argument("report", type=Path)
    inspect_parser.add_argument("--json", action="store_true", help="Print machine-readable summary")

    session_parser = subparsers.add_parser("create-session", help="Create a Fix Session after applying changes")
    session_parser.add_argument("report", type=Path)
    session_parser.add_argument("--output", type=Path, required=True)
    session_parser.add_argument("--workspace", type=Path, default=Path.cwd())
    session_parser.add_argument("--summary", required=True)
    session_parser.add_argument("--change", action="append", default=[], metavar="FILE|REASON|FINDING_IDS")
    session_parser.add_argument("--check", action="append", default=[], metavar="COMMAND|STATUS|DETAILS")
    session_parser.add_argument("--suggested-command", action="append", default=[])
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        if args.command == "inspect":
            summary = report_summary(load_package(args.report))
            if args.json:
                print(json.dumps(summary, ensure_ascii=False, indent=2))
            else:
                print_human(summary)
        else:
            session = create_session(args)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(session, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"Created {args.output} for report {session['reportId']}")
        return 0
    except (OSError, PackageError) as exc:
        parser.exit(2, f"error: {exc}\n")


if __name__ == "__main__":
    raise SystemExit(main())
