(function initComparison(global) {
  const get = (value, path) => path.split(".").reduce((cursor, key) => cursor?.[key], value) ?? null;
  const memory = (snapshot) => snapshot?.runtime?.processMemory?.privateMemory
    || snapshot?.runtime?.memory?.pageMemory?.bytes
    || snapshot?.runtime?.memory?.usedJSHeapSize
    || null;
  const METRICS = [
    { label: "LCP", key: "timing.lcp", unit: "ms", direction: -1 },
    { label: "INP", key: "timing.inp", unit: "ms", direction: -1 },
    { label: "CLS", key: "timing.cls", unit: "", direction: -1 },
    { label: "TTFB", key: "timing.ttfb", unit: "ms", direction: -1 },
    { label: "FCP", key: "timing.fcp", unit: "ms", direction: -1 },
    { label: "阻塞时间", key: "runtime.totalBlockingTime", unit: "ms", direction: -1 },
    { label: "页面/进程内存", key: "runtime.memory", unit: "bytes", direction: -1, read: memory },
    { label: "传输体积", key: "resources.transferSize", unit: "bytes", direction: -1 },
    { label: "DOM 节点", key: "document.domNodes", unit: "", direction: -1 },
  ];

  function compare(baselinePackage, currentSnapshot, currentAudits) {
    const baseline = baselinePackage?.evidence?.snapshot;
    if (!baseline) throw new Error("基线报告缺少 Performance Snapshot。");
    const metrics = METRICS.map(({ label, key, unit, direction, read }) => {
      const before = read ? read(baseline) : get(baseline, key);
      const after = read ? read(currentSnapshot) : get(currentSnapshot, key);
      const delta = Number.isFinite(before) && Number.isFinite(after) ? after - before : null;
      const improved = delta === null ? null : delta * direction > 0;
      return { label, key, before, after, delta, unit, improved };
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
