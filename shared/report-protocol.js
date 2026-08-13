(function initReportProtocol(global) {
  const SCHEMA_VERSION = "1.0.0";
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

  function id(prefix = "report") {
    return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  }

  function stripCodeFence(text) {
    const trimmed = String(text || "").trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1] : trimmed;
  }

  function extractJson(text) {
    const clean = stripCodeFence(text);
    try { return JSON.parse(clean); } catch (_) {
      const start = clean.indexOf("{");
      const end = clean.lastIndexOf("}");
      if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
      throw new Error("模型没有返回有效的结构化 JSON。");
    }
  }

  function normalizePlan(value) {
    if (!value || typeof value !== "object") throw new Error("Optimization Plan 必须是对象。");
    const findings = Array.isArray(value.findings) ? value.findings : [];
    const roadmap = Array.isArray(value.roadmap) ? value.roadmap : [];
    return {
      version: "1.0",
      summary: String(value.summary || "暂无总体结论"),
      riskLevel: ["critical", "high", "medium", "low"].includes(value.riskLevel) ? value.riskLevel : "medium",
      findings: findings.slice(0, 20).map((finding, index) => ({
        id: String(finding.id || `finding-${index + 1}`),
        category: String(finding.category || "quality"),
        severity: ["critical", "high", "medium", "low", "info"].includes(finding.severity) ? finding.severity : "medium",
        title: String(finding.title || "未命名问题"),
        evidence: Array.isArray(finding.evidence) ? finding.evidence.map(String).slice(0, 8) : [],
        impact: String(finding.impact || ""),
        confidence: Number.isFinite(finding.confidence) ? Math.max(0, Math.min(1, finding.confidence)) : 0.7,
        actions: (Array.isArray(finding.actions) ? finding.actions : []).slice(0, 8).map((action) => ({
          priority: ["P0", "P1", "P2"].includes(action.priority) ? action.priority : "P1",
          title: String(action.title || action.description || "执行优化"),
          description: String(action.description || ""),
          targetHints: Array.isArray(action.targetHints) ? action.targetHints.map(String).slice(0, 12) : [],
          expectedImpact: String(action.expectedImpact || ""),
          acceptanceChecks: Array.isArray(action.acceptanceChecks) ? action.acceptanceChecks.map(String).slice(0, 10) : [],
        })),
      })).sort((a, b) => severityRank[a.severity] - severityRank[b.severity]),
      roadmap: roadmap.slice(0, 8).map((phase, index) => ({
        phase: String(phase.phase || `阶段 ${index + 1}`),
        objective: String(phase.objective || ""),
        findingIds: Array.isArray(phase.findingIds) ? phase.findingIds.map(String) : [],
        exitCriteria: Array.isArray(phase.exitCriteria) ? phase.exitCriteria.map(String) : [],
      })),
      unknowns: Array.isArray(value.unknowns) ? value.unknowns.map(String).slice(0, 12) : [],
    };
  }

  function sanitizeSnapshot(snapshot) {
    const safe = structuredClone(snapshot);
    try {
      const url = new URL(safe.page.url);
      safe.page.url = `${url.origin}${url.pathname}`;
      safe.page.urlQueryRemoved = Boolean(url.search || url.hash);
    } catch (_) { safe.page.url = "[invalid URL removed]"; }
    return safe;
  }

  function createPackage({ snapshot, audits, attachments = [], plan = null, provider = null, comparison = null }) {
    if (!snapshot?.page?.measuredAt) throw new Error("缺少有效的 Performance Snapshot。");
    return {
      schema: "perflens.audit-package",
      schemaVersion: SCHEMA_VERSION,
      reportId: id(),
      generatedAt: new Date().toISOString(),
      source: {
        product: "PerfLens Chrome",
        productVersion: chrome?.runtime?.getManifest?.().version || "unknown",
        page: { title: snapshot.page.title, url: sanitizeSnapshot(snapshot).page.url },
      },
      evidence: {
        snapshot: sanitizeSnapshot(snapshot),
        audits,
        attachments: attachments.map(({ content, structured, ...metadata }) => ({ ...metadata, content })),
      },
      optimizationPlan: plan,
      diagnosis: provider ? { provider, generatedAt: new Date().toISOString() } : null,
      comparison,
      privacy: {
        urlQueryRemovedForModel: true,
        externalEvidenceTruncated: attachments.some((item) => item.truncated),
      },
    };
  }

  function renderMarkdown(pkg) {
    const plan = pkg.optimizationPlan;
    const snapshot = pkg.evidence.snapshot;
    const lines = [
      "# 前端质量与性能诊断报告",
      "",
      `- 报告 ID：\`${pkg.reportId}\``,
      `- 页面：${snapshot.page.title || "无标题"}`,
      `- 采集时间：${snapshot.page.measuredAt}`,
      `- 结构版本：${pkg.schemaVersion}`,
      "",
      "## 核心指标",
      "",
      `| 指标 | 数值 |`,
      `| --- | ---: |`,
      `| LCP | ${snapshot.timing.lcp ?? "未采集"} ms |`,
      `| INP | ${snapshot.timing.inp ?? "未采集"} ms |`,
      `| CLS | ${snapshot.timing.cls ?? "未采集"} |`,
      `| TTFB | ${snapshot.timing.ttfb ?? "未采集"} ms |`,
      `| 总阻塞时间 | ${snapshot.runtime.totalBlockingTime} ms |`,
      `| DOM 节点 | ${snapshot.document.domNodes} |`,
      "",
    ];
    if (!plan) {
      lines.push("## 确定性审计", "");
      for (const audit of pkg.evidence.audits) lines.push(`- **${audit.severity.toUpperCase()} · ${audit.title}**：${audit.evidence}`);
      if (pkg.comparison) appendComparison(lines, pkg.comparison);
      return lines.join("\n");
    }
    lines.push("## 总体结论", "", plan.summary, "", "## 优化问题与行动", "");
    for (const finding of plan.findings) {
      lines.push(`### ${finding.severity.toUpperCase()} · ${finding.title}`, "", finding.impact || "", "");
      for (const evidence of finding.evidence) lines.push(`- 证据：${evidence}`);
      for (const action of finding.actions) {
        lines.push(`- **${action.priority} ${action.title}**：${action.description}`);
        if (action.expectedImpact) lines.push(`  - 预期：${action.expectedImpact}`);
        for (const check of action.acceptanceChecks) lines.push(`  - 验收：${check}`);
      }
      lines.push("");
    }
    lines.push("## 分阶段路径", "");
    for (const phase of plan.roadmap) lines.push(`- **${phase.phase}**：${phase.objective}；退出条件：${phase.exitCriteria.join("；")}`);
    if (plan.unknowns.length) lines.push("", "## 待补充证据", "", ...plan.unknowns.map((item) => `- ${item}`));
    if (pkg.comparison) appendComparison(lines, pkg.comparison);
    return lines.join("\n");
  }

  function appendComparison(lines, comparison) {
      lines.push("", "## 复测差异", "", `- 基线报告：\`${comparison.baselineReportId}\``);
      for (const metric of comparison.metrics) {
        if (metric.delta !== null) lines.push(`- ${metric.label}：${metric.before} → ${metric.after}（${metric.delta > 0 ? "+" : ""}${metric.delta}${metric.unit}）${metric.improved ? " ✅" : ""}`);
      }
      lines.push(`- 已解决规则：${comparison.resolvedAuditIds.length}；新增规则：${comparison.newAuditIds.length}；仍存在：${comparison.remainingAuditIds.length}`);
  }

  function validatePackage(pkg) {
    const errors = [];
    if (pkg?.schema !== "perflens.audit-package") errors.push("schema 不匹配");
    if (String(pkg?.schemaVersion || "").split(".")[0] !== "1") errors.push("不支持的 schema major version");
    if (!pkg?.evidence?.snapshot) errors.push("缺少 snapshot");
    if (!Array.isArray(pkg?.evidence?.audits)) errors.push("缺少 audits");
    return { valid: errors.length === 0, errors };
  }

  global.PerfLensReport = { SCHEMA_VERSION, extractJson, normalizePlan, createPackage, renderMarkdown, validatePackage, sanitizeSnapshot };
})(globalThis);
