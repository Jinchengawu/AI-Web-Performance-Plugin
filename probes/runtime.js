(function initRuntimeProbe(global) {
  if (global.PerfLensRuntime) return;

  const MEMORY_SAMPLE_INTERVAL = 5000;
  const MAX_MEMORY_SAMPLES = 120;
  const MB = 1024 * 1024;
  const state = {
    lcp: null,
    cls: 0,
    inp: null,
    longTasks: [],
    layoutShifts: 0,
    events: 0,
    interactions: new Map(),
    lcpElement: null,
    longAnimationFrames: [],
    clsEntries: [],
    memorySamples: [],
    errors: [],
    startedAt: Date.now(),
    lastDomNodes: null,
  };

  function observe(type, callback, options = {}) {
    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe({ type, buffered: true, ...options });
    } catch (_) {
      // Optional entry types vary by Chrome version and page context.
    }
  }

  function sampleMemory() {
    const now = Date.now();
    if (now - (state.memorySamples.at(-1)?.at || 0) < 1000) return;
    const memory = performance.memory;
    if (state.memorySamples.length % 3 === 0) state.lastDomNodes = document.getElementsByTagName("*").length;
    state.memorySamples.push({
      at: now,
      elapsed: Math.round(performance.now()),
      usedJSHeapSize: memory?.usedJSHeapSize || null,
      totalJSHeapSize: memory?.totalJSHeapSize || null,
      jsHeapSizeLimit: memory?.jsHeapSizeLimit || null,
      domNodes: state.lastDomNodes,
    });
    state.memorySamples = state.memorySamples.slice(-MAX_MEMORY_SAMPLES);
  }

  function analyzeMemorySamples(samples, externalBytes = null) {
    const usable = samples.filter((sample) => Number.isFinite(sample.usedJSHeapSize));
    const latest = usable.at(-1)?.usedJSHeapSize ?? null;
    const peak = usable.length ? Math.max(...usable.map((sample) => sample.usedJSHeapSize)) : null;
    const durationMs = usable.length > 1 ? usable.at(-1).at - usable[0].at : 0;
    const growthBytes = usable.length > 1 ? usable.at(-1).usedJSHeapSize - usable[0].usedJSHeapSize : null;
    let slopeBytesPerMinute = null;
    let monotonicGrowthRatio = null;
    if (usable.length > 1 && durationMs > 0) {
      const x0 = usable[0].at;
      const xs = usable.map((sample) => sample.at - x0);
      const ys = usable.map((sample) => sample.usedJSHeapSize);
      const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
      const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
      const numerator = xs.reduce((sum, value, index) => sum + (value - meanX) * (ys[index] - meanY), 0);
      const denominator = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
      slopeBytesPerMinute = denominator ? (numerator / denominator) * 60000 : 0;
      const increasing = usable.slice(1).filter((sample, index) => sample.usedJSHeapSize > usable[index].usedJSHeapSize).length;
      monotonicGrowthRatio = increasing / (usable.length - 1);
    }

    const observedBytes = Math.max(latest || 0, externalBytes || 0);
    const enoughTrend = usable.length >= 5 && durationMs >= 30000;
    let level = "insufficient";
    let reason = "需要至少 30 秒、5 个样本才能评估持续增长。";
    if (observedBytes >= 1024 * MB) {
      level = "high";
      reason = "观测内存已达到或超过 1GB；需结合堆快照和复现路径确认泄漏来源。";
    } else if (enoughTrend && growthBytes > 50 * MB && slopeBytesPerMinute > 20 * MB && monotonicGrowthRatio >= 0.7) {
      level = "high";
      reason = "内存在观察窗口内快速且多数采样持续增长，存在较高泄漏风险。";
    } else if (enoughTrend && growthBytes > 20 * MB && slopeBytesPerMinute > 5 * MB && monotonicGrowthRatio >= 0.6) {
      level = "watch";
      reason = "内存呈持续上升趋势，建议延长操作复现并采集 DevTools Heap Snapshot。";
    } else if (enoughTrend) {
      level = "stable";
      reason = "当前观察窗口未发现显著持续增长；这不排除更长会话中的泄漏。";
    }

    return {
      level,
      reason,
      sampleCount: usable.length,
      durationMs,
      latestUsedJSHeapSize: latest,
      peakUsedJSHeapSize: peak,
      growthBytes,
      slopeBytesPerMinute: Number.isFinite(slopeBytesPerMinute) ? Math.round(slopeBytesPerMinute) : null,
      monotonicGrowthRatio: Number.isFinite(monotonicGrowthRatio) ? Number(monotonicGrowthRatio.toFixed(2)) : null,
    };
  }

  async function measurePageMemory() {
    if (!global.crossOriginIsolated || typeof performance.measureUserAgentSpecificMemory !== "function") {
      return { supported: false, reason: "需要安全上下文、跨源隔离以及受支持的 Chrome 版本。" };
    }
    try {
      const result = await performance.measureUserAgentSpecificMemory();
      const byType = {};
      for (const item of result.breakdown || []) {
        for (const type of item.types || ["Other"]) byType[type] = (byType[type] || 0) + (item.bytes || 0);
      }
      return { supported: true, bytes: result.bytes, byType };
    } catch (error) {
      return { supported: false, reason: String(error.message || error).slice(0, 180) };
    }
  }

  observe("largest-contentful-paint", (entries) => {
    const last = entries.at(-1);
    if (!last) return;
    state.lcp = Math.round(last.startTime);
    state.lcpElement = last.element ? {
      tag: last.element.tagName?.toLowerCase() || null,
      id: last.element.id?.slice(0, 80) || null,
      className: typeof last.element.className === "string" ? last.element.className.slice(0, 160) : null,
      url: last.url ? last.url.split("?")[0].slice(0, 220) : null,
      size: last.size || null,
    } : null;
  });

  observe("layout-shift", (entries) => {
    for (const entry of entries) {
      if (entry.hadRecentInput) continue;
      const last = state.clsEntries.at(-1);
      if (!last || entry.startTime - last.startTime > 1000 || entry.startTime - state.clsEntries[0].startTime > 5000) state.clsEntries = [];
      state.clsEntries.push({ startTime: entry.startTime, value: entry.value });
      state.cls = Math.max(state.cls, state.clsEntries.reduce((sum, item) => sum + item.value, 0));
      state.layoutShifts += 1;
    }
  });

  observe("event", (entries) => {
    state.events += entries.length;
    for (const entry of entries) {
      if (entry.interactionId) state.interactions.set(entry.interactionId, Math.max(state.interactions.get(entry.interactionId) || 0, entry.duration));
    }
    const durations = [...state.interactions.values()].sort((a, b) => b - a);
    const index = Math.min(Math.floor(durations.length / 50), Math.max(0, durations.length - 1));
    state.inp = durations.length ? Math.round(durations[index]) : null;
  }, { durationThreshold: 40 });

  observe("longtask", (entries) => {
    state.longTasks.push(...entries.map((entry) => ({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) })));
    state.longTasks = state.longTasks.slice(-100);
  });

  observe("long-animation-frame", (entries) => {
    state.longAnimationFrames.push(...entries.map((entry) => ({
      start: Math.round(entry.startTime),
      duration: Math.round(entry.duration),
      blockingDuration: Math.round(entry.blockingDuration || 0),
      scripts: (entry.scripts || []).slice(0, 5).map((script) => ({
        sourceURL: script.sourceURL?.split("?")[0].slice(0, 220) || null,
        functionName: script.sourceFunctionName?.slice(0, 120) || null,
        duration: Math.round(script.duration || 0),
      })),
    })));
    state.longAnimationFrames = state.longAnimationFrames.slice(-30);
  });

  global.addEventListener("error", (event) => {
    state.errors.push({ type: "error", message: String(event.message || "Script error").slice(0, 180), at: Date.now() });
    state.errors = state.errors.slice(-20);
  });
  global.addEventListener("unhandledrejection", (event) => {
    state.errors.push({ type: "unhandledrejection", message: String(event.reason?.message || event.reason || "Unhandled rejection").slice(0, 180), at: Date.now() });
    state.errors = state.errors.slice(-20);
  });

  sampleMemory();
  global.setInterval(sampleMemory, MEMORY_SAMPLE_INTERVAL);

  global.PerfLensRuntime = {
    analyzeMemorySamples,
    async snapshot() {
      sampleMemory();
      const pageMemory = await measurePageMemory();
      const memory = performance.memory;
      return {
        lcp: state.lcp,
        lcpElement: state.lcpElement,
        cls: Number(state.cls.toFixed(3)),
        inp: state.inp,
        layoutShifts: state.layoutShifts,
        observedEvents: state.events,
        sessionDurationMs: Date.now() - state.startedAt,
        longTaskCount: state.longTasks.length,
        totalBlockingTime: state.longTasks.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0),
        longTasks: state.longTasks.slice(-20),
        longAnimationFrames: state.longAnimationFrames.slice(-10),
        runtimeErrors: state.errors.slice(-10),
        memory: {
          usedJSHeapSize: memory?.usedJSHeapSize || null,
          totalJSHeapSize: memory?.totalJSHeapSize || null,
          jsHeapSizeLimit: memory?.jsHeapSizeLimit || null,
          samples: state.memorySamples.slice(-60),
          pageMemory,
          risk: analyzeMemorySamples(state.memorySamples, pageMemory.supported ? pageMemory.bytes : null),
        },
      };
    },
  };
})(globalThis);
