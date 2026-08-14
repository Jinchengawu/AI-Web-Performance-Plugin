import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "skills/perflens-optimize/scripts/perflens_package.py"
SPEC = importlib.util.spec_from_file_location("perflens_package", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PerfLensPackageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.report_path = self.root / "audit.json"
        self.report = {
            "schema": "perflens.audit-package",
            "schemaVersion": "1.0.0",
            "reportId": "report-test",
            "evidence": {
                "snapshot": {
                    "page": {"title": "Fixture", "url": "https://example.com/", "measuredAt": "2026-08-14T00:00:00Z"},
                    "timing": {"lcp": 2500, "inp": 200, "cls": 0.1, "ttfb": 500},
                    "runtime": {"totalBlockingTime": 120},
                },
                "audits": [],
            },
            "optimizationPlan": {"findings": []},
        }
        self.report_path.write_text(json.dumps(self.report), encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def test_load_and_summarize(self):
        report = MODULE.load_package(self.report_path)
        summary = MODULE.report_summary(report)
        self.assertEqual(summary["reportId"], "report-test")
        self.assertEqual(summary["metrics"]["lcpMs"], 2500)

    def test_rejects_wrong_schema(self):
        self.report["schema"] = "other"
        self.report_path.write_text(json.dumps(self.report), encoding="utf-8")
        with self.assertRaises(MODULE.PackageError):
            MODULE.load_package(self.report_path)

    def test_session_hashes_changed_file(self):
        changed = self.root / "src/app.js"
        changed.parent.mkdir()
        changed.write_text("console.log('fixed');\n", encoding="utf-8")
        args = type("Args", (), {
            "report": self.report_path,
            "workspace": self.root,
            "summary": "Applied fix",
            "change": ["src/app.js|Removed blocking work|finding-1"],
            "check": ["npm test|passed|3 tests"],
            "suggested_command": [],
        })()
        session = MODULE.create_session(args)
        self.assertEqual(session["reportId"], "report-test")
        self.assertEqual(session["changes"][0]["findingIds"], ["finding-1"])
        self.assertEqual(len(session["changes"][0]["sha256"]), 64)
        self.assertTrue(session["requiresBrowserRecapture"])


if __name__ == "__main__":
    unittest.main()
