const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { webcrypto } = require("crypto");

const sandbox = {
  console,
  URL,
  structuredClone,
  crypto: webcrypto,
  chrome: { runtime: { getManifest: () => ({ version: "test" }) } },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("shared/report-protocol.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync("shared/comparison.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync("probes/audits.js", "utf8"), sandbox);

const snapshot = {
  page: { title: "Test", url: "https://example.com/path?token=secret#hash", measuredAt: "2026-08-14T00:00:00Z" },
  timing: { lcp: 5000, inp: 350, cls: 0.2, ttfb: 1200 },
  runtime: { totalBlockingTime: 500, longTaskCount: 2, memory: { usedJSHeapSize: 100 * 1024 * 1024, risk: { level: "watch", reason: "fixture" } } },
  resources: { transferSize: 4 * 1024 * 1024, count: 100 },
  document: { domNodes: 2000, maxDomDepth: 25, imagesWithoutAlt: 1, images: 2, unlabeledControls: 1, buttonsWithoutName: 0, imagesWithoutDimensions: 1, scripts: 10, asyncScripts: 2 },
  seo: { title: "", description: "", canonical: "", h1Count: 0, lang: "", jsonLd: [] },
};
const audits = sandbox.PerfLensAudits.run(snapshot);
assert(sandbox.PerfLensAudits.ruleCount >= 40, `expected at least 40 rules, got ${sandbox.PerfLensAudits.ruleCount}`);
assert(audits.length >= 10, `expected broad audit findings, got ${audits.length}`);

const pkg = sandbox.PerfLensReport.createPackage({ snapshot, audits });
assert.equal(pkg.schemaVersion, "1.1.0");
assert.equal(pkg.evidence.snapshot.page.url, "https://example.com/path");
assert.equal(JSON.stringify(pkg).includes("secret"), false);
assert.equal(sandbox.PerfLensReport.validatePackage(pkg).valid, true);

const after = structuredClone(snapshot);
after.timing.lcp = 2000;
after.runtime.memory.usedJSHeapSize = 80 * 1024 * 1024;
const comparison = sandbox.PerfLensComparison.compare(pkg, after, audits.filter((item) => item.id !== "perf.lcp"));
assert.equal(comparison.metrics.find((item) => item.label === "LCP").improved, true);
assert.equal(comparison.metrics.find((item) => item.label === "页面/进程内存").improved, true);
assert(comparison.resolvedAuditIds.includes("perf.lcp"));

const plan = sandbox.PerfLensReport.normalizePlan({ summary: "ok", findings: [{ title: "x", severity: "high", actions: [{ priority: "P0", title: "fix" }] }] });
assert.equal(plan.findings[0].actions[0].priority, "P0");
console.log("PerfLens protocol and audit tests passed");
