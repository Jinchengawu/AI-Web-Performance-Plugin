const fs = require("fs");

function validateReport(report) {
  const errors = [];
  if (report?.schema !== "perflens.audit-package") errors.push("不是 PerfLens Portable Audit Package");
  if (String(report?.schemaVersion || "").split(".")[0] !== "1") errors.push(`不支持的结构版本：${report?.schemaVersion || "缺失"}`);
  if (!report?.evidence?.snapshot) errors.push("缺少 Performance Snapshot");
  if (!Array.isArray(report?.evidence?.audits)) errors.push("缺少 Audit Finding 列表");
  if (!report?.optimizationPlan) errors.push("报告尚未包含大模型 Optimization Plan");
  return { valid: errors.length === 0, errors };
}

function readReport(filePath) {
  const report = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const validation = validateReport(report);
  if (!validation.valid) throw new Error(validation.errors.join("；"));
  return report;
}

function reportMarkdown(report) {
  const plan = report.optimizationPlan;
  const lines = [`# ${report.source?.page?.title || "PerfLens 优化计划"}`, "", plan.summary, ""];
  for (const finding of plan.findings || []) {
    lines.push(`## ${finding.severity.toUpperCase()} · ${finding.title}`, "", finding.impact || "", "");
    for (const evidence of finding.evidence || []) lines.push(`- 证据：${evidence}`);
    for (const action of finding.actions || []) {
      lines.push(`- **${action.priority} ${action.title}**：${action.description}`);
      for (const check of action.acceptanceChecks || []) lines.push(`  - 验收：${check}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

module.exports = { validateReport, readReport, reportMarkdown };
