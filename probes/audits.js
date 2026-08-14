(function initAuditProbe(global) {
  if (global.PerfLensAudits) return;
  const rules = [];
  const add = (id, category, severity, title, test, evidence, recommendation, available = () => true) => {
    rules.push({ id, category, severity, title, test, evidence, recommendation, available });
  };
  const mb = (bytes) => `${(bytes / 1048576).toFixed(1)}MB`;

  add("perf.lcp", "performance", "high", "最大内容绘制过慢", (s) => s.timing.lcp > 2500, (s) => `LCP ${s.timing.lcp}ms，良好阈值 ≤2500ms`, "优化首屏关键资源、服务端响应与最大内容元素。", (s) => Number.isFinite(s.timing.lcp));
  add("perf.inp", "performance", "high", "交互响应过慢", (s) => s.timing.inp > 200, (s) => `INP ${s.timing.inp}ms，良好阈值 ≤200ms`, "拆分长任务并降低事件处理器同步工作量。", (s) => Number.isFinite(s.timing.inp));
  add("perf.cls", "performance", "high", "页面布局不稳定", (s) => s.timing.cls > 0.1, (s) => `CLS ${s.timing.cls}，良好阈值 ≤0.1`, "为媒体和动态区域预留尺寸，避免内容插入造成位移。", (s) => Number.isFinite(s.timing.cls));
  add("perf.ttfb", "performance", "medium", "首字节响应较慢", (s) => s.timing.ttfb > 800, (s) => `TTFB ${s.timing.ttfb}ms，良好阈值 ≤800ms`, "检查边缘缓存、后端耗时和重定向链。", (s) => Number.isFinite(s.timing.ttfb));
  add("perf.fcp", "performance", "medium", "首次内容绘制较慢", (s) => s.timing.fcp > 1800, (s) => `FCP ${s.timing.fcp}ms，良好阈值 ≤1800ms`, "减少渲染阻塞资源并内联必要的首屏样式。", (s) => Number.isFinite(s.timing.fcp));
  add("perf.load", "performance", "low", "完整加载耗时较长", (s) => s.timing.load > 4000, (s) => `Load ${s.timing.load}ms`, "延迟非关键资源并检查慢资源瀑布。", (s) => Number.isFinite(s.timing.load) && s.timing.load > 0);
  add("perf.blocking", "performance", "high", "主线程阻塞明显", (s) => s.runtime.totalBlockingTime > 200, (s) => `总阻塞时间 ${s.runtime.totalBlockingTime}ms，长任务 ${s.runtime.longTaskCount} 个`, "拆包、延迟非关键脚本并将重计算移出主线程。");
  add("perf.loaf", "performance", "high", "发现长动画帧", (s) => s.runtime.longAnimationFrames.some((item) => item.duration > 50), (s) => `${s.runtime.longAnimationFrames.length} 个长动画帧，最长 ${Math.max(...s.runtime.longAnimationFrames.map((item) => item.duration))}ms`, "根据脚本归因降低单帧 JavaScript 与样式布局工作量。", (s) => Array.isArray(s.runtime.longAnimationFrames));
  add("perf.dom-size", "performance", "medium", "DOM 规模过大", (s) => s.document.domNodes > 1500, (s) => `DOM ${s.document.domNodes} 个节点，最大深度 ${s.document.maxDomDepth}`, "使用虚拟列表、延迟渲染并压平无语义嵌套。");
  add("perf.resource-weight", "performance", "medium", "页面传输体积较大", (s) => s.resources.transferSize > 2.5 * 1048576, (s) => `传输 ${mb(s.resources.transferSize)}，共 ${s.resources.count} 个资源`, "优先压缩最大资源并清理未使用代码。");
  add("perf.resource-count", "performance", "low", "资源请求数量较多", (s) => s.resources.count > 120, (s) => `共 ${s.resources.count} 个资源请求`, "合并碎片化小资源并延迟非关键请求。");
  add("perf.javascript-weight", "performance", "medium", "JavaScript 体积较大", (s) => (s.resources.byType?.script?.transferSize || 0) > 1024 * 1024, (s) => `脚本传输 ${mb(s.resources.byType.script.transferSize)}`, "按路由拆包、移除未使用依赖并延迟第三方脚本。", (s) => Boolean(s.resources.byType));
  add("perf.image-weight", "performance", "medium", "图片传输体积较大", (s) => (s.resources.byType?.img?.transferSize || 0) > 2 * 1048576, (s) => `图片传输 ${mb(s.resources.byType.img.transferSize)}`, "转换现代格式、提供响应式尺寸并延迟首屏外图片。", (s) => Boolean(s.resources.byType));
  add("perf.third-party", "performance", "medium", "第三方来源较多", (s) => s.resources.thirdPartyOrigins.length > 8, (s) => `${s.resources.thirdPartyOrigins.length} 个第三方来源`, "审计第三方脚本收益，延迟或移除非必要来源。");
  add("perf.memory-footprint", "performance", "high", "页面内存占用过高", (s) => Math.max(s.runtime.processMemory?.privateMemory || 0, s.runtime.memory?.pageMemory?.bytes || 0, s.runtime.memory?.usedJSHeapSize || 0) >= 512 * 1048576, (s) => `可用观测峰值 ${mb(Math.max(s.runtime.processMemory?.privateMemory || 0, s.runtime.memory?.pageMemory?.bytes || 0, s.runtime.memory?.usedJSHeapSize || 0))}`, "记录稳定复现步骤并使用 Memory 面板比较 Heap Snapshot 与 Detached DOM。", (s) => Boolean(s.runtime.memory));
  add("perf.memory-growth", "performance", "high", "内存持续增长风险", (s) => ["watch", "high"].includes(s.runtime.memory?.risk?.level), (s) => `${s.runtime.memory.risk.reason} 斜率 ${mb(Math.max(0, s.runtime.memory.risk.slopeBytesPerMinute || 0))}/分钟`, "重复同一操作并在垃圾回收后比较对象保留路径。", (s) => ["stable", "watch", "high"].includes(s.runtime.memory?.risk?.level));

  add("seo.title-missing", "seo", "high", "缺少页面标题", (s) => !s.seo.title, () => "未检测到有效 <title>", "为每个可索引页面提供唯一且描述准确的标题。");
  add("seo.title-length", "seo", "low", "页面标题长度不理想", (s) => s.seo.title && (s.seo.title.length < 10 || s.seo.title.length > 60), (s) => `标题长度 ${s.seo.title.length} 个字符`, "控制标题长度并把核心主题置于前部。");
  add("seo.description-missing", "seo", "medium", "缺少 Meta Description", (s) => !s.seo.description, () => "未检测到 meta[name=description]", "添加准确、唯一、面向搜索摘要的页面描述。");
  add("seo.description-length", "seo", "low", "Meta Description 长度不理想", (s) => s.seo.description && (s.seo.description.length < 50 || s.seo.description.length > 160), (s) => `Description 长度 ${s.seo.description.length} 个字符`, "用简洁语句覆盖页面价值和核心主题。");
  add("seo.canonical-missing", "seo", "medium", "缺少 Canonical URL", (s) => !s.seo.canonical, () => "未检测到 link[rel=canonical]", "为可索引页面声明规范 URL，降低重复内容风险。");
  add("seo.canonical-invalid", "seo", "high", "Canonical URL 无效", (s) => s.seo.canonical && !s.seo.canonicalValid, (s) => `无法解析 canonical：${s.seo.canonical.slice(0, 120)}`, "改为可解析的绝对或正确相对 URL。");
  add("seo.h1", "seo", "medium", "H1 结构异常", (s) => s.seo.h1Count !== 1, (s) => `检测到 ${s.seo.h1Count} 个 H1`, "保留一个清晰表达页面主旨的 H1。");
  add("seo.heading-order", "seo", "low", "标题层级存在跳级", (s) => s.seo.headingSkipCount > 0, (s) => `${s.seo.headingSkipCount} 处标题层级跳级`, "按内容层级顺序组织 H1–H6，而不是用级别控制样式。");
  add("seo.lang", "seo", "medium", "缺少页面语言声明", (s) => !s.seo.lang, () => "html 元素未设置 lang", "设置与主要内容一致的 html[lang]。");
  add("seo.viewport", "seo", "high", "缺少移动端 Viewport", (s) => !s.seo.viewport, () => "未检测到 meta[name=viewport]", "声明 width=device-width 和合理的 initial-scale。");
  add("seo.noindex", "seo", "info", "页面被标记为 Noindex", (s) => s.seo.noindex, (s) => `robots=${s.seo.robots}`, "确认该页面确实不需要出现在搜索结果中。");
  add("seo.structured-data", "seo", "medium", "结构化数据无效", (s) => s.seo.jsonLd.some((item) => !item.valid), (s) => `${s.seo.jsonLd.filter((item) => !item.valid).length} 段 JSON-LD 无法解析`, "修复 JSON-LD 语法并使用搜索引擎测试工具验证。");
  add("seo.open-graph", "seo", "low", "社交分享元数据不完整", (s) => !s.seo.openGraphComplete, () => "og:title、og:description、og:image 未完整提供", "补全 Open Graph 标题、描述和预览图。");
  add("seo.twitter-card", "seo", "low", "缺少 Twitter Card", (s) => !s.seo.twitterCard, () => "未检测到 twitter:card", "声明合适的 Twitter Card 类型并复用一致的分享信息。");
  add("seo.meta-refresh", "seo", "medium", "使用 Meta Refresh 跳转", (s) => Boolean(s.seo.metaRefresh), (s) => `refresh=${s.seo.metaRefresh}`, "使用 HTTP 3xx 或应用路由替代客户端 Meta Refresh。");

  add("a11y.image-alt", "accessibility", "medium", "图片缺少替代文本", (s) => s.document.imagesWithoutAlt > 0, (s) => `${s.document.imagesWithoutAlt}/${s.document.images} 张图片没有 alt 属性`, "为信息图片提供替代文本，装饰图片使用空 alt。");
  add("a11y.form-label", "accessibility", "high", "表单控件缺少名称", (s) => s.document.unlabeledControls > 0, (s) => `${s.document.unlabeledControls} 个表单控件缺少可访问名称`, "关联 label 或提供 aria-label/aria-labelledby。");
  add("a11y.button-name", "accessibility", "high", "按钮缺少可访问名称", (s) => s.document.buttonsWithoutName > 0, (s) => `${s.document.buttonsWithoutName} 个按钮没有文本或可访问名称`, "添加可见文本或准确的 aria-label。");
  add("a11y.link-name", "accessibility", "medium", "链接缺少可访问名称", (s) => s.document.emptyLinks > 0, (s) => `${s.document.emptyLinks} 个链接没有可访问名称`, "为链接提供描述目标的文本或 aria-label。");
  add("a11y.iframe-title", "accessibility", "medium", "Iframe 缺少标题", (s) => s.document.iframesWithoutTitle > 0, (s) => `${s.document.iframesWithoutTitle} 个 iframe 缺少 title`, "为嵌入内容提供简洁准确的 title。");
  add("a11y.duplicate-id", "accessibility", "high", "页面存在重复 ID", (s) => s.document.duplicateIds.length > 0, (s) => `重复 ID：${s.document.duplicateIds.slice(0, 5).join("、")}`, "保证 ID 唯一，避免标签和 ARIA 引用错误。");
  add("a11y.main-landmark", "accessibility", "low", "缺少主内容地标", (s) => s.document.mainLandmarks !== 1, (s) => `检测到 ${s.document.mainLandmarks} 个 main 地标`, "提供唯一的 main 或 role=main 主内容区域。");

  add("quality.image-size", "quality", "medium", "图片未声明尺寸", (s) => s.document.imagesWithoutDimensions > 0, (s) => `${s.document.imagesWithoutDimensions}/${s.document.images} 张图片未同时声明宽高`, "声明 width/height 或 aspect-ratio，降低布局偏移。");
  add("quality.sync-script", "quality", "medium", "同步脚本可能阻塞解析", (s) => s.document.scripts - s.document.asyncScripts > 3, (s) => `${s.document.scripts - s.document.asyncScripts} 个脚本未使用 async/defer/module`, "仅保留关键同步脚本，其余使用 defer/module 或延迟加载。");
  add("quality.mixed-content", "quality", "high", "HTTPS 页面加载不安全资源", (s) => s.document.mixedContentResources > 0, (s) => `${s.document.mixedContentResources} 个 HTTP 子资源`, "将所有子资源升级到 HTTPS 并设置 CSP upgrade-insecure-requests。");
  add("quality.opener", "quality", "medium", "新窗口链接缺少 Noopener", (s) => s.document.targetBlankWithoutNoopener > 0, (s) => `${s.document.targetBlankWithoutNoopener} 个 target=_blank 链接未设置 noopener`, "添加 rel=noopener，避免新页面访问 opener。");
  add("quality.runtime-errors", "quality", "high", "页面运行时出现错误", (s) => s.runtime.runtimeErrors.length > 0, (s) => `${s.runtime.runtimeErrors.length} 个脚本错误或未处理 Promise`, "根据错误消息和堆栈修复异常，并添加自动化回归测试。", (s) => Array.isArray(s.runtime.runtimeErrors));

  function evaluate(snapshot) {
    const findings = [];
    const coverage = { rules: rules.length, evaluated: 0, passed: 0, failed: 0, unavailable: 0, categories: {} };
    for (const rule of rules) {
      coverage.categories[rule.category] ||= { rules: 0, evaluated: 0, failed: 0 };
      coverage.categories[rule.category].rules += 1;
      let available = false;
      try { available = Boolean(rule.available(snapshot)); } catch (_) { available = false; }
      if (!available) { coverage.unavailable += 1; continue; }
      coverage.evaluated += 1;
      coverage.categories[rule.category].evaluated += 1;
      let failed = false;
      try { failed = Boolean(rule.test(snapshot)); } catch (_) { failed = false; }
      if (!failed) { coverage.passed += 1; continue; }
      coverage.failed += 1;
      coverage.categories[rule.category].failed += 1;
      findings.push({ id: rule.id, category: rule.category, severity: rule.severity, title: rule.title, evidence: rule.evidence(snapshot), recommendation: rule.recommendation });
    }
    return { findings, coverage };
  }

  global.PerfLensAudits = { evaluate, run: (snapshot) => evaluate(snapshot).findings, ruleCount: rules.length };
})(globalThis);
