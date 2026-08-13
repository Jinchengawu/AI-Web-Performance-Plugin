(function initRuntimeProbe(global) {
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
  };

  function observe(type, callback, options = {}) {
    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe({ type, buffered: true, ...options });
    } catch (_) {
      // Optional entry types vary by browser and page context.
    }
  }

  observe("largest-contentful-paint", (entries) => {
    const last = entries.at(-1);
    if (last) {
      state.lcp = Math.round(last.startTime);
      state.lcpElement = last.element ? {
        tag: last.element.tagName?.toLowerCase() || null,
        id: last.element.id?.slice(0, 80) || null,
        className: typeof last.element.className === "string" ? last.element.className.slice(0, 160) : null,
        url: last.url ? last.url.split("?")[0].slice(0, 220) : null,
        size: last.size || null,
      } : null;
    }
  });

  observe("layout-shift", (entries) => {
    // CLS session windows: max 1s gap, max 5s total window.
    for (const entry of entries) {
      if (!entry.hadRecentInput) {
        const last = state.clsEntries?.at(-1);
        state.clsEntries ||= [];
        if (!last || entry.startTime - last.startTime > 1000 || entry.startTime - state.clsEntries[0].startTime > 5000) {
          state.clsEntries = [];
        }
        state.clsEntries.push({ startTime: entry.startTime, value: entry.value });
        const windowValue = state.clsEntries.reduce((sum, item) => sum + item.value, 0);
        state.cls = Math.max(state.cls, windowValue);
        state.layoutShifts += 1;
      }
    }
  });

  observe("event", (entries) => {
    state.events += entries.length;
    for (const entry of entries) {
      if (entry.interactionId) {
        state.interactions.set(entry.interactionId, Math.max(state.interactions.get(entry.interactionId) || 0, entry.duration));
      }
    }
    const durations = [...state.interactions.values()].sort((a, b) => b - a);
    // INP uses a high-percentile interaction; discard one worst outlier per 50 interactions.
    const index = Math.min(Math.floor(durations.length / 50), Math.max(0, durations.length - 1));
    state.inp = durations.length ? Math.round(durations[index]) : null;
  }, { durationThreshold: 40 });

  observe("longtask", (entries) => {
    state.longTasks.push(...entries.map((entry) => ({
      start: Math.round(entry.startTime),
      duration: Math.round(entry.duration),
    })));
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

  global.PerfLensRuntime = {
    snapshot() {
      return {
        lcp: state.lcp,
        lcpElement: state.lcpElement,
        cls: Number(state.cls.toFixed(3)),
        inp: state.inp,
        layoutShifts: state.layoutShifts,
        observedEvents: state.events,
        longTaskCount: state.longTasks.length,
        totalBlockingTime: state.longTasks.reduce(
          (sum, task) => sum + Math.max(0, task.duration - 50),
          0
        ),
        longTasks: state.longTasks.slice(-20),
        longAnimationFrames: state.longAnimationFrames.slice(-10),
      };
    },
  };
})(globalThis);
