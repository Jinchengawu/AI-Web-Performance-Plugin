const $ = (selector) => document.querySelector(selector);
let currentMetrics = null;
let currentAudits = [];
let currentCoverage = null;
let currentReport = "";
let currentPackage = null;
let attachments = [];
let baselinePackage = null;
let historyBaselinePackage = null;
let currentComparison = null;
let historyRecords = [];
let activePageUrl = "";
let providerProfiles = {};
let activeProvider = "openai-responses";

const providerPresets = {
  "openai-responses": {
    name: "OpenAI",
    apiBase: "https://api.openai.com/v1",
    model: "gpt-5.6-luna",
    hint: "POST /responses · Bearer Token",
  },
  deepseek: {
    name: "DeepSeek",
    apiBase: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    hint: "POST /chat/completions · OpenAI 兼容规范",
  },
  anthropic: {
    name: "Anthropic / Claude",
    apiBase: "https://api.anthropic.com",
    model: "claude-opus-4-8",
    hint: "POST /v1/messages · 也支持 Anthropic 格式网关",
  },
  "openai-chat": {
    name: "OpenAI-compatible",
    apiBase: "https://api.openai.com/v1",
    model: "gpt-5.6-luna",
    hint: "适用于通义、硅基流动、Ollama 网关等兼容服务",
  },
};

const thresholds = {
  lcp: [2500, 4000],
  inp: [200, 500],
  cls: [0.1, 0.25],
  ttfb: [800, 1800],
};

function stateFor(key, value) {
  if (value === null || value === undefined) return "placeholder";
  const [good, poor] = thresholds[key];
  return value <= good ? "good" : value <= poor ? "warn" : "bad";
}

function formatMetric(key, value) {
  if (value === null || value === undefined) return "未采集";
  if (key === "cls") return value.toFixed(3);
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "未采集";
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function calculateScore(metrics) {
  const weights = { lcp: 30, inp: 25, cls: 25, ttfb: 20 };
  let score = 0;
  let available = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const value = metrics.timing[key];
    if (value === null || value === undefined) continue;
    available += weight;
    const [good, poor] = thresholds[key];
    const ratio = value <= good ? 1 : value >= poor ? 0.25 : 1 - ((value - good) / (poor - good)) * 0.75;
    score += weight * ratio;
  }
  if (!available) return 0;
  let normalized = (score / available) * 100;
  normalized -= Math.min(12, metrics.runtime.totalBlockingTime / 100);
  normalized -= metrics.document.domNodes > 1500 ? 5 : 0;
  const observedMemory = memoryBytes(metrics);
  if (observedMemory >= 1073741824) normalized -= 20;
  else if (observedMemory >= 512 * 1048576) normalized -= 12;
  else if (observedMemory >= 256 * 1048576) normalized -= 6;
  if (metrics.runtime.memory?.risk?.level === "high") normalized -= 10;
  else if (metrics.runtime.memory?.risk?.level === "watch") normalized -= 5;
  return Math.max(0, Math.round(normalized));
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function renderMarkdown(markdown) {
  const tables = [];
  let safe = escapeHtml(markdown);
  safe = safe.replace(/^\|(.+)\|\n\|([\s:|-]+)\|\n((?:\|.*\|\n?)*)/gm, (_match, header, _divider, rows) => {
    const cells = (line) => line.split("|").map((cell) => cell.trim()).filter(Boolean);
    const html = `<table><thead><tr>${cells(header).map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${rows.trim().split("\n").filter(Boolean).map((row) => `<tr>${cells(row).map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    tables.push(html);
    return `@@TABLE${tables.length - 1}@@`;
  });
  let html = safe
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n{2,}/g, "<br><br>");
  tables.forEach((table, index) => { html = html.replace(`@@TABLE${index}@@`, table); });
  return html;
}

function showStatus(message, isError = false) {
  $("#status").textContent = message;
  $("#status").classList.toggle("error", isError);
}

function showModelError(error) {
  const status = $("#status");
  status.classList.add("error");
  status.replaceChildren();

  if (error?.kind === "AUTH") {
    const summary = document.createElement("div");
    summary.textContent = `${error.providerName} 鉴权失败（HTTP ${error.status}）。当前请求：${error.endpoint}`;
    const detail = document.createElement("div");
    detail.textContent = "请确认已选择正确提供方，并填写该提供方签发的 API Key。";
    const action = document.createElement("button");
    action.type = "button";
    action.className = "status-action";
    action.textContent = "打开模型设置";
    action.addEventListener("click", () => {
      $("#settings").hidden = false;
      $("#apiKey").focus();
    });
    status.append(summary, detail, action);
    $("#settings").hidden = false;
    return;
  }

  const detail = error?.detail || String(error || "诊断失败。");
  if (error?.kind === "LOCAL" && detail.includes("API Key")) {
    status.textContent = detail;
    $("#settings").hidden = false;
    $("#apiKey").focus();
    return;
  }
  status.textContent = error?.providerName
    ? `${error.providerName} 请求失败（HTTP ${error.status}）：${detail}`
    : detail;
}

function renderMetrics(metrics) {
  const score = calculateScore(metrics);
  const color = score >= 90 ? "#28b47f" : score >= 60 ? "#e1a13d" : "#e66052";
  $("#score").textContent = score;
  $("#scoreRing").style.setProperty("--score-angle", `${score * 3.6}deg`);
  $("#scoreRing").style.setProperty("--score-color", color);
  $("#verdict").textContent = score >= 90 ? "运行状态良好" : score >= 60 ? "存在优化空间" : "需要优先治理";
  $("#scoreHint").textContent = `基于可用核心指标、${metrics.runtime.longTaskCount} 个长任务与 ${currentCoverage?.evaluated || 0} 条有效规则估算`;
  $("#pageTitle").textContent = metrics.page.title || "无标题页面";
  $("#pageUrl").textContent = metrics.page.url;

  const labels = { lcp: ["LCP", "最大内容绘制"], inp: ["INP", "交互响应"], cls: ["CLS", "布局偏移"], ttfb: ["TTFB", "服务端响应"] };
  $("#metricGrid").innerHTML = Object.entries(labels).map(([key, [name, description]]) => {
    const value = metrics.timing[key];
    return `<article class="metric ${stateFor(key, value)}"><span>${name}</span><strong>${formatMetric(key, value)}</strong><small>${description}</small></article>`;
  }).join("");

  $("#details").hidden = false;
  $("#details").innerHTML = `
    <div class="detail"><span>传输资源</span><strong>${formatBytes(metrics.resources.transferSize)}</strong></div>
    <div class="detail"><span>DOM 节点</span><strong>${metrics.document.domNodes}</strong></div>
    <div class="detail"><span>阻塞时间</span><strong>${metrics.runtime.totalBlockingTime} ms</strong></div>`;
  renderMemory(metrics);
  renderEnvironment(metrics.environment);
  $("#diagnose").disabled = false;
}

function renderAuditSummary() {
  const categories = { performance: 0, seo: 0, accessibility: 0, quality: 0 };
  for (const audit of currentAudits) categories[audit.category] = (categories[audit.category] || 0) + 1;
  const coverage = currentCoverage || { rules: currentAudits.length, evaluated: currentAudits.length, passed: 0, unavailable: 0 };
  $("#details").insertAdjacentHTML("beforeend", `
    <div class="audit-summary">
      <span>综合规则覆盖</span>
      <strong>${coverage.evaluated}/${coverage.rules}</strong>
      <small>发现 ${currentAudits.length} · 通过 ${coverage.passed} · 暂不可测 ${coverage.unavailable}<br>性能 ${categories.performance} · SEO ${categories.seo} · 无障碍 ${categories.accessibility} · 质量 ${categories.quality}</small>
    </div>`);
}

function memoryBytes(metrics) {
  return metrics.runtime.processMemory?.privateMemory
    || metrics.runtime.memory?.pageMemory?.bytes
    || metrics.runtime.memory?.usedJSHeapSize
    || null;
}

function memoryLevelLabel(level) {
  return ({ high: "高风险", watch: "需观察", stable: "暂未见增长", insufficient: "采样不足" })[level] || "未评估";
}

async function hasProcessMemoryPermission() {
  try { return await chrome.permissions.contains({ permissions: ["processes"] }); }
  catch (_) { return false; }
}

async function collectProcessMemory(tabId, snapshot) {
  if (!await hasProcessMemoryPermission() || !chrome.processes?.getProcessIdForTab) return false;
  try {
    const processId = await chrome.processes.getProcessIdForTab(tabId);
    const result = await chrome.processes.getProcessInfo(processId, true);
    const process = result?.[processId] || result?.[String(processId)];
    if (!process) return false;
    snapshot.runtime.processMemory = {
      processId,
      type: process.type,
      privateMemory: process.privateMemory ?? null,
      jsMemoryAllocated: process.jsMemoryAllocated ?? null,
      jsMemoryUsed: process.jsMemoryUsed ?? null,
    };
    if (process.privateMemory >= 1073741824) snapshot.runtime.memory.risk = {
      ...snapshot.runtime.memory.risk,
      level: "high",
      reason: "Chrome 渲染进程私有内存已达到或超过 1GB；单点高占用不是泄漏定论，需结合重复操作与 Heap Snapshot。",
    };
    return true;
  } catch (_) { return false; }
}

function renderMemory(metrics) {
  const panel = $("#memoryPanel");
  const memory = metrics.runtime.memory || {};
  const risk = memory.risk || { level: "insufficient", reason: "暂无趋势证据。", sampleCount: 0, durationMs: 0 };
  const source = metrics.runtime.processMemory?.privateMemory ? "Chrome 渲染进程私有内存"
    : memory.pageMemory?.supported ? "页面与同源 Worker 估算" : "JavaScript Heap";
  panel.hidden = false;
  panel.dataset.risk = risk.level;
  $("#memoryContent").innerHTML = `
    <div class="memory-value"><strong>${formatBytes(memoryBytes(metrics))}</strong><span>${escapeHtml(source)}</span></div>
    <div class="memory-trend"><span>${memoryLevelLabel(risk.level)}</span><strong>${risk.slopeBytesPerMinute === null || risk.slopeBytesPerMinute === undefined ? "—" : `${formatBytes(Math.abs(risk.slopeBytesPerMinute))}/分钟`}</strong></div>
    <p>${escapeHtml(risk.reason)}</p>
    <small>${risk.sampleCount || 0} 个 JS Heap 样本 · ${Math.round((risk.durationMs || 0) / 1000)} 秒观察窗口 · 当前 Heap ${formatBytes(memory.usedJSHeapSize)}</small>`;
  hasProcessMemoryPermission().then((granted) => {
    $("#memoryPermission").textContent = granted ? (metrics.runtime.processMemory ? "进程内存已采集" : "当前版本暂不可用") : "启用进程内存";
    $("#memoryPermission").disabled = granted && Boolean(metrics.runtime.processMemory);
  });
}

function renderEnvironment(environment) {
  const panel = $("#environmentPanel");
  if (!environment) { panel.hidden = true; return; }
  const brands = environment.browser?.uaData?.fullVersionList || environment.browser?.uaData?.brands || [];
  const browser = brands.length ? brands.map((item) => `${item.brand} ${item.version}`).join(" / ") : environment.browser?.userAgent || "未知";
  const os = [environment.operatingSystem?.platform, environment.operatingSystem?.platformVersion, environment.operatingSystem?.architecture].filter(Boolean).join(" ") || "未知";
  const network = environment.network || {};
  panel.hidden = false;
  $("#environmentContent").innerHTML = `
    <div><span>浏览器</span><strong title="${escapeHtml(browser)}">${escapeHtml(browser)}</strong></div>
    <div><span>操作系统</span><strong>${escapeHtml(os)}</strong></div>
    <div><span>设备</span><strong>${environment.device?.hardwareConcurrency || "?"} 核 · ${environment.device?.deviceMemoryGB || "?"}GB</strong></div>
    <div><span>网络</span><strong>${network.effectiveType || "未知"} · ${network.downlinkMbps ?? "?"}Mbps · RTT ${network.rttMs ?? "?"}ms</strong></div>
    <div><span>显示</span><strong>${environment.display?.viewportWidth}×${environment.display?.viewportHeight} · DPR ${environment.display?.devicePixelRatio}</strong></div>
    <div><span>上下文</span><strong>${environment.pageContext?.crossOriginIsolated ? "跨源隔离" : "非跨源隔离"} · ${environment.pageContext?.timezone || "时区未知"}</strong></div>`;
}

function updateComparison() {
  const baseline = attachments.find((item) => item.format === "perflens" && item.structured)?.structured || historyBaselinePackage;
  baselinePackage = baseline || null;
  currentComparison = baselinePackage && currentMetrics
    ? globalThis.PerfLensComparison.compare(baselinePackage, currentMetrics, currentAudits)
    : null;
  const panel = $("#comparison");
  panel.hidden = !currentComparison;
  if (!currentComparison) return;
  const improved = currentComparison.metrics.filter((item) => item.improved).length;
  panel.innerHTML = `<div><span>基线对比</span><strong>${improved}/${currentComparison.metrics.filter((item) => item.delta !== null).length} 项改善</strong></div><small>已解决 ${currentComparison.resolvedAuditIds.length} · 新增 ${currentComparison.newAuditIds.length} · 仍存在 ${currentComparison.remainingAuditIds.length}</small>`;
}

function rebuildPackage(plan = currentPackage?.optimizationPlan || null, provider = currentPackage?.diagnosis?.provider || null) {
  if (!currentMetrics) return null;
  currentPackage = globalThis.PerfLensReport.createPackage({
    snapshot: currentMetrics,
    audits: currentAudits,
    attachments,
    plan,
    provider,
    comparison: currentComparison,
    coverage: currentCoverage,
    history: historyEvidence(),
    reportId: currentPackage?.reportId || null,
  });
  currentReport = globalThis.PerfLensReport.renderMarkdown(currentPackage);
  $("#reportContent").innerHTML = renderMarkdown(currentReport);
  $("#reportSection").hidden = false;
  return currentPackage;
}

function historyEvidence() {
  return historyRecords.slice(0, 5).map((record) => ({
    reportId: record.reportId,
    measuredAt: record.createdAt,
    score: record.score,
    metrics: record.metrics,
    auditCount: record.auditCount,
    diagnosed: record.diagnosed,
  }));
}

function formatHistoryTime(value) {
  try { return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
  catch (_) { return value; }
}

function renderHistory() {
  const list = $("#historyList");
  list.replaceChildren();
  $("#clearHistory").hidden = !historyRecords.length;
  if (!historyRecords.length) {
    const empty = document.createElement("span");
    empty.className = "empty-note";
    empty.textContent = "还没有持久化记录，完成首次采集后会自动保存。";
    list.append(empty);
    return;
  }
  for (const record of historyRecords) {
    const row = document.createElement("article");
    row.className = `history-row${historyBaselinePackage?.reportId === record.reportId ? " selected" : ""}`;
    const choose = document.createElement("button");
    choose.type = "button";
    choose.className = "history-main";
    choose.title = "设为本次复测基线";
    choose.innerHTML = `<span>${escapeHtml(formatHistoryTime(record.createdAt))}</span><strong>${record.score}</strong><small>LCP ${formatMetric("lcp", record.metrics.lcp)} · 内存 ${formatBytes(record.metrics.memoryBytes)} · ${record.auditCount} 项发现</small>`;
    choose.addEventListener("click", () => {
      historyBaselinePackage = historyBaselinePackage?.reportId === record.reportId ? null : record.package;
      renderHistory();
      updateComparison();
      if (currentMetrics) rebuildPackage();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "history-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `删除 ${formatHistoryTime(record.createdAt)} 的记录`);
    remove.addEventListener("click", async () => {
      await globalThis.PerfLensHistory.remove(activePageUrl, record.runId);
      if (historyBaselinePackage?.reportId === record.reportId) historyBaselinePackage = null;
      await loadHistory(activePageUrl);
      updateComparison();
    });
    row.append(choose, remove);
    list.append(row);
  }
}

async function loadHistory(url) {
  activePageUrl = url || activePageUrl;
  if (!/^https?:/.test(activePageUrl || "")) { historyRecords = []; renderHistory(); return; }
  historyRecords = await globalThis.PerfLensHistory.list(activePageUrl);
  renderHistory();
}

async function persistCurrentRun() {
  if (!currentPackage) return;
  await globalThis.PerfLensHistory.save(currentPackage, calculateScore(currentMetrics));
  await loadHistory(currentMetrics.page.url);
}

function renderEvidenceList() {
  const list = $("#evidenceList");
  list.replaceChildren();
  if (!attachments.length) {
    const empty = document.createElement("span");
    empty.textContent = "尚未导入外部材料";
    list.append(empty);
    return;
  }
  for (const attachment of attachments) {
    const row = document.createElement("div");
    row.className = "evidence-item";
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = attachment.name;
    const metadata = document.createElement("span");
    metadata.textContent = `${attachment.format} · ${Math.ceil(attachment.originalBytes / 1024)}KB${attachment.truncated ? " · 已裁剪" : ""}`;
    copy.append(name, metadata);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "移除";
    remove.addEventListener("click", () => {
      attachments = attachments.filter((item) => item.id !== attachment.id);
      renderEvidenceList();
      updateComparison();
      if (currentMetrics) rebuildPackage();
    });
    row.append(copy, remove);
    list.append(row);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function collect() {
  $("#analyze").disabled = true;
  showStatus("正在读取 Performance API 数据…");
  try {
    const tab = await getActiveTab();
    if (!tab?.id || !/^https?:/.test(tab.url || "")) throw new Error("此页面不允许性能采集，请打开普通网站后重试。");
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: "COLLECT_METRICS" });
    } catch (_) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["probes/runtime.js", "probes/snapshot.js", "probes/audits.js", "content.js"],
      });
      response = await chrome.tabs.sendMessage(tab.id, { type: "COLLECT_METRICS" });
    }
    if (!response?.ok) throw new Error("页面指标采集失败。");
    const processMemoryAdded = await collectProcessMemory(tab.id, response.data);
    if (processMemoryAdded) {
      const refreshedAudit = globalThis.PerfLensAudits.evaluate(response.data);
      response.audits = refreshedAudit.findings;
      response.coverage = refreshedAudit.coverage;
    }
    currentPackage = null;
    currentMetrics = response.data;
    currentAudits = response.audits || [];
    currentCoverage = response.coverage || null;
    renderMetrics(currentMetrics);
    renderAuditSummary();
    updateComparison();
    rebuildPackage(null, null);
    await persistCurrentRun();
    const risk = currentMetrics.runtime.memory?.risk;
    showStatus(`快照已保存到当前页面历史。内存已采样 ${risk?.sampleCount || 0} 次、观察 ${Math.round((risk?.durationMs || 0) / 1000)} 秒；保持操作后再次采集可提高泄漏判断可信度。`);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    $("#analyze").disabled = false;
  }
}

async function diagnose() {
  if (!currentMetrics) return;
  $("#diagnose").disabled = true;
  showStatus("大模型正在分析指标并生成行动清单…");
  try {
    const response = await chrome.runtime.sendMessage({
      type: "AI_DIAGNOSE",
      evidence: { snapshot: currentMetrics, audits: currentAudits, coverage: currentCoverage, history: historyEvidence(), attachments },
    });
    if (!response?.ok) {
      showModelError(response?.error);
      return;
    }
    rebuildPackage(response.plan, response.provider);
    await persistCurrentRun();
    $("#reportSection").scrollIntoView({ behavior: "smooth", block: "start" });
    showStatus("诊断报告已生成。");
  } catch (error) {
    showModelError({ kind: "LOCAL", detail: error.message });
  } finally {
    $("#diagnose").disabled = false;
  }
}

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    provider: "openai-responses",
    providerProfiles: {},
    apiBase: "",
    model: "",
    apiKey: "",
  });
  providerProfiles = settings.providerProfiles;
  if (!Object.keys(providerProfiles).length && (settings.apiBase || settings.model || settings.apiKey)) {
    providerProfiles[settings.provider] = {
      apiBase: settings.apiBase,
      model: settings.model,
      apiKey: settings.apiKey,
    };
  }
  $("#provider").value = settings.provider;
  activeProvider = settings.provider;
  applyProviderProfile(settings.provider);
}

function applyProviderProfile(provider) {
  const preset = providerPresets[provider];
  const profile = providerProfiles[provider] || {};
  $("#apiBase").value = profile.apiBase || preset.apiBase;
  $("#model").value = profile.model || preset.model;
  $("#apiKey").value = profile.apiKey || "";
  $("#apiKeyLabel").textContent = `${preset.name} API Key`;
  $("#apiKey").placeholder = provider === "openai-chat" ? "本地网关可留空" : "填写当前提供方的 Key";
  $("#providerHint").textContent = preset.hint;
}

async function saveSettings() {
  const provider = $("#provider").value;
  const preset = providerPresets[provider];
  providerProfiles[provider] = {
    apiBase: $("#apiBase").value.trim() || preset.apiBase,
    model: $("#model").value.trim() || preset.model,
    apiKey: $("#apiKey").value.trim(),
  };
  await chrome.storage.local.set({
    provider,
    providerProfiles,
    apiBase: "",
    model: "",
    apiKey: "",
  });
  showStatus("设置已保存到本机浏览器。");
  $("#settings").hidden = true;
}

$("#settingsToggle").addEventListener("click", () => { $("#settings").hidden = !$("#settings").hidden; });
$("#provider").addEventListener("change", () => {
  const previousPreset = providerPresets[activeProvider];
  providerProfiles[activeProvider] = {
    apiBase: $("#apiBase").value.trim() || previousPreset.apiBase,
    model: $("#model").value.trim() || previousPreset.model,
    apiKey: $("#apiKey").value.trim(),
  };
  activeProvider = $("#provider").value;
  applyProviderProfile(activeProvider);
});
$("#saveSettings").addEventListener("click", saveSettings);
$("#analyze").addEventListener("click", collect);
$("#diagnose").addEventListener("click", diagnose);
$("#memoryPermission").addEventListener("click", async () => {
  try {
    const granted = await chrome.permissions.request({ permissions: ["processes"] });
    if (!granted) { showStatus("未授予进程内存权限；仍会继续采集页面 JS Heap 趋势。"); return; }
    if (!chrome.processes?.getProcessIdForTab) {
      showStatus("权限已授予，但当前 Chrome 通道未开放 Processes API；将继续使用页面内存与 JS Heap。", true);
      return;
    }
    showStatus("进程内存权限已启用，正在重新采集当前页面…");
    await collect();
  } catch (error) { showStatus(`无法启用进程内存：${error.message}`, true); }
});
$("#clearHistory").addEventListener("click", async () => {
  if (!activePageUrl || !confirm("清空当前页面的全部 PerfLens 本地测试历史？此操作无法撤销。")) return;
  await globalThis.PerfLensHistory.clear(activePageUrl);
  historyBaselinePackage = null;
  await loadHistory(activePageUrl);
  updateComparison();
  showStatus("当前页面的本地测试历史已清空。");
});
$("#copyReport").addEventListener("click", async () => {
  await navigator.clipboard.writeText(currentReport);
  $("#copyReport").textContent = "已复制";
  setTimeout(() => { $("#copyReport").textContent = "复制"; }, 1200);
});

$("#evidenceFiles").addEventListener("change", async (event) => {
  const files = [...event.target.files];
  if (!files.length) return;
  showStatus(`正在导入 ${files.length} 份外部材料…`);
  try {
    if (attachments.length + files.length > 8) throw new Error("最多同时导入 8 份外部材料。");
    for (const file of files) attachments.push(await globalThis.PerfLensEvidence.ingest(file));
    renderEvidenceList();
    updateComparison();
    if (currentMetrics) { rebuildPackage(); await persistCurrentRun(); }
    showStatus(`已导入 ${files.length} 份材料，诊断时会作为补充证据。`);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    event.target.value = "";
  }
});

function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function requirePackage() {
  if (!currentPackage) throw new Error("请先采集性能快照。");
  return currentPackage;
}

$("#exportJson").addEventListener("click", () => {
  try { downloadFile(`perflens-${Date.now()}.json`, JSON.stringify(requirePackage(), null, 2), "application/json"); }
  catch (error) { showStatus(error.message, true); }
});
$("#exportMarkdown").addEventListener("click", () => {
  try { downloadFile(`perflens-${Date.now()}.md`, globalThis.PerfLensReport.renderMarkdown(requirePackage()), "text/markdown"); }
  catch (error) { showStatus(error.message, true); }
});
$("#exportRaw").addEventListener("click", () => {
  try { downloadFile(`perflens-raw-${Date.now()}.json`, JSON.stringify(requirePackage().evidence.snapshot, null, 2), "application/json"); }
  catch (error) { showStatus(error.message, true); }
});

loadSettings();
getActiveTab().then((tab) => {
  if (tab?.title) $("#pageTitle").textContent = tab.title;
  if (tab?.url) $("#pageUrl").textContent = tab.url;
  loadHistory(tab?.url || "");
});
