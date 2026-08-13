(function initComparison(global) {
  const METRICS = [
    ["LCP", "timing", "lcp", "ms", -1],
    ["INP", "timing", "inp", "ms", -1],
    ["CLS", "timing", "cls", "", -1],
    ["TTFB", "timing", "ttfb", "ms", -1],
    ["阻塞时间", "runtime", "totalBlockingTime", "ms", -1],
    ["传输体积", "resources", "transferSize", "bytes", -1],
    ["DOM 节点", "document", "domNodes", "", -1],
  ];

  function compare(baselinePackage, currentSnapshot, currentAudits) {
    const baseline = baselinePackage?.evidence?.snapshot;
    if (!baseline) throw new Error("基线报告缺少 Performance Snapshot。");
    const metrics = METRICS.map(([label, group, key, unit, direction]) => {
      const before = baseline[group]?.[key] ?? null;
      const after = currentSnapshot[group]?.[key] ?? null;
      const delta = Number.isFinite(before) && Number.isFinite(after) ? after - before : null;
      const improved = delta === null ? null : delta * direction > 0;
      return { label, key: `${group}.${key}`, before, after, delta, unit, improved };
    });
    const beforeIds = new Set((baselinePackage.evidence.audits || []).map((item) => item.id));
    const afterIds = new Set((currentAudits || []).map((item) => item.id));
    return {
      baselineReportId: baselinePackage.reportId,
      comparedAt: new Date().toISOString(),
      metrics,
      resolvedAuditIds: [...beforeIds].filter((id) => !afterIds.has(id)),
      newAuditIds: [...afterIds].filter((id) => !beforeIds.has(id)),
      remainingAuditIds: [...afterIds].filter((id) => beforeIds.has(id)),
    };
  }

  global.PerfLensComparison = { compare };
})(globalThis);
