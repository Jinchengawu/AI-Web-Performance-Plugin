(function initEvidenceIntake(global) {
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
  const MAX_CONTENT_CHARS = 80_000;

  function lighthouseSummary(value) {
    const result = value.lighthouseResult || value;
    if (!result?.audits || !result?.categories) return null;
    const categoryScores = Object.fromEntries(Object.entries(result.categories).map(([key, category]) => [key, category.score]));
    const auditIds = ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index", "interactive", "server-response-time"];
    const audits = Object.fromEntries(auditIds.filter((key) => result.audits[key]).map((key) => [key, {
      score: result.audits[key].score,
      numericValue: result.audits[key].numericValue,
      displayValue: result.audits[key].displayValue,
    }]));
    return { format: "lighthouse", lighthouseVersion: result.lighthouseVersion, fetchTime: result.fetchTime, categoryScores, audits };
  }

  function portableSummary(value) {
    if (value?.schema !== "perflens.audit-package" || !value?.evidence?.snapshot) return null;
    return {
      format: "perflens",
      schema: value.schema,
      schemaVersion: value.schemaVersion,
      reportId: value.reportId,
      generatedAt: value.generatedAt,
      source: value.source,
      evidence: value.evidence,
      optimizationPlan: value.optimizationPlan,
    };
  }

  function fixSessionSummary(value) {
    if (!value?.reportId || !Array.isArray(value?.changes) || !value?.appliedAt) return null;
    return { format: "perflens-fix", ...value };
  }

  async function ingest(file) {
    if (!file) throw new Error("未选择文件。");
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} 超过 2MB 限制。`);
    const raw = await file.text();
    let format = "text";
    let content = raw;
    if (/\.json$/i.test(file.name) || file.type.includes("json")) {
      try {
        const parsed = JSON.parse(raw);
        const lighthouse = lighthouseSummary(parsed);
        const portable = portableSummary(parsed);
        const fixSession = fixSessionSummary(parsed);
        const normalized = lighthouse || portable || fixSession || parsed;
        format = lighthouse ? "lighthouse" : portable ? "perflens" : fixSession ? "perflens-fix" : "json";
        content = JSON.stringify(normalized, null, 2);
      } catch (error) {
        throw new Error(`${file.name} 不是有效 JSON：${error.message}`);
      }
    } else if (/\.html?$/i.test(file.name) || file.type.includes("html")) {
      format = "html";
      content = new DOMParser().parseFromString(raw, "text/html").body.textContent || "";
    } else if (/\.csv$/i.test(file.name)) {
      format = "csv";
    } else if (/\.md$/i.test(file.name)) {
      format = "markdown";
    }
    const truncated = content.length > MAX_CONTENT_CHARS;
    return {
      id: `attachment_${crypto.randomUUID().slice(0, 8)}`,
      name: file.name,
      format,
      mimeType: file.type || "text/plain",
      originalBytes: file.size,
      importedAt: new Date().toISOString(),
      truncated,
      content: content.slice(0, MAX_CONTENT_CHARS),
      structured: format === "perflens" || format === "perflens-fix" ? JSON.parse(content) : null,
    };
  }

  global.PerfLensEvidence = { ingest, MAX_FILE_BYTES };
})(globalThis);
