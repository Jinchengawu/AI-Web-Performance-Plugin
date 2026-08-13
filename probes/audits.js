(function initAuditProbe(global) {
  const rules = [];
  const add = (id, category, severity, title, test, evidence, recommendation) => {
    rules.push({ id, category, severity, title, test, evidence, recommendation });
  };

  add("perf.lcp", "performance", "high", "最大内容绘制过慢", (s) => s.timing.lcp > 2500,
    (s) => `LCP ${s.timing.lcp}ms，良好阈值 ≤2500ms`, "优化首屏关键资源、服务端响应与最大内容元素。" );
  add("perf.inp", "performance", "high", "交互响应过慢", (s) => s.timing.inp > 200,
    (s) => `INP ${s.timing.inp}ms，良好阈值 ≤200ms`, "拆分长任务并降低事件处理器同步工作量。" );
  add("perf.cls", "performance", "high", "页面布局不稳定", (s) => s.timing.cls > 0.1,
    (s) => `CLS ${s.timing.cls}，良好阈值 ≤0.1`, "为媒体和动态区域预留尺寸，避免内容插入造成位移。" );
  add("perf.ttfb", "performance", "medium", "首字节响应较慢", (s) => s.timing.ttfb > 800,
    (s) => `TTFB ${s.timing.ttfb}ms，良好阈值 ≤800ms`, "检查边缘缓存、后端耗时和重定向链。" );
  add("perf.blocking", "performance", "high", "主线程阻塞明显", (s) => s.runtime.totalBlockingTime > 200,
    (s) => `总阻塞时间 ${s.runtime.totalBlockingTime}ms，长任务 ${s.runtime.longTaskCount} 个`, "拆包、延迟非关键脚本并将重计算移出主线程。" );
  add("perf.dom-size", "performance", "medium", "DOM 规模过大", (s) => s.document.domNodes > 1500,
    (s) => `DOM ${s.document.domNodes} 个节点，最大深度 ${s.document.maxDomDepth}`, "使用虚拟列表、延迟渲染并压平无语义嵌套。" );
  add("perf.resource-weight", "performance", "medium", "页面传输体积较大", (s) => s.resources.transferSize > 2.5 * 1024 * 1024,
    (s) => `传输 ${(s.resources.transferSize / 1048576).toFixed(1)}MB，共 ${s.resources.count} 个资源`, "优先压缩最大资源并清理未使用代码。" );
  add("seo.title-missing", "seo", "high", "缺少页面标题", (s) => !s.seo.title,
    () => "未检测到有效 <title>", "为每个可索引页面提供唯一且描述准确的标题。" );
  add("seo.title-length", "seo", "low", "页面标题长度不理想", (s) => s.seo.title && (s.seo.title.length < 10 || s.seo.title.length > 60),
    (s) => `标题长度 ${s.seo.title.length} 个字符`, "控制标题长度并把核心主题置于前部。" );
  add("seo.description", "seo", "medium", "缺少 Meta Description", (s) => !s.seo.description,
    () => "未检测到 meta[name=description]", "添加准确、唯一、面向搜索摘要的页面描述。" );
  add("seo.canonical", "seo", "medium", "缺少 Canonical URL", (s) => !s.seo.canonical,
    () => "未检测到 link[rel=canonical]", "为可索引页面声明规范 URL，降低重复内容风险。" );
  add("seo.h1", "seo", "medium", "H1 结构异常", (s) => s.seo.h1Count !== 1,
    (s) => `检测到 ${s.seo.h1Count} 个 H1`, "保留一个清晰表达页面主旨的 H1。" );
  add("seo.lang", "seo", "medium", "缺少页面语言声明", (s) => !s.seo.lang,
    () => "html 元素未设置 lang", "设置与主要内容一致的 html[lang]。" );
  add("seo.structured-data", "seo", "low", "结构化数据无效", (s) => s.seo.jsonLd.some((item) => !item.valid),
    (s) => `${s.seo.jsonLd.filter((item) => !item.valid).length} 段 JSON-LD 无法解析`, "修复 JSON-LD 语法并使用搜索引擎测试工具验证。" );
  add("a11y.image-alt", "accessibility", "medium", "图片缺少替代文本", (s) => s.document.imagesWithoutAlt > 0,
    (s) => `${s.document.imagesWithoutAlt}/${s.document.images} 张图片没有 alt 属性`, "为信息图片提供替代文本，装饰图片使用空 alt。" );
  add("a11y.form-label", "accessibility", "high", "表单控件缺少名称", (s) => s.document.unlabeledControls > 0,
    (s) => `${s.document.unlabeledControls} 个表单控件缺少可访问名称`, "关联 label 或提供 aria-label/aria-labelledby。" );
  add("a11y.button-name", "accessibility", "high", "按钮缺少可访问名称", (s) => s.document.buttonsWithoutName > 0,
    (s) => `${s.document.buttonsWithoutName} 个按钮没有文本或可访问名称`, "添加可见文本或准确的 aria-label。" );
  add("quality.image-size", "quality", "medium", "图片未声明尺寸", (s) => s.document.imagesWithoutDimensions > 0,
    (s) => `${s.document.imagesWithoutDimensions}/${s.document.images} 张图片未同时声明宽高`, "声明 width/height 或 aspect-ratio，降低布局偏移。" );
  add("quality.sync-script", "quality", "medium", "同步脚本可能阻塞解析", (s) => s.document.scripts - s.document.asyncScripts > 3,
    (s) => `${s.document.scripts - s.document.asyncScripts} 个脚本未使用 async/defer/module`, "仅保留关键同步脚本，其余使用 defer/module 或延迟加载。" );

  global.PerfLensAudits = {
    run(snapshot) {
      return rules.filter((rule) => {
        try { return rule.test(snapshot); } catch (_) { return false; }
      }).map((rule) => ({
        id: rule.id,
        category: rule.category,
        severity: rule.severity,
        title: rule.title,
        evidence: rule.evidence(snapshot),
        recommendation: rule.recommendation,
      }));
    },
    ruleCount: rules.length,
  };
})(globalThis);
