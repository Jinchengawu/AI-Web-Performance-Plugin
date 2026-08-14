(function initHistoryStore(global) {
  const STORAGE_KEY = "perflensHistoryV1";
  const MAX_PAGE_RUNS = 20;
  const MAX_TOTAL_RUNS = 120;
  const TARGET_BYTES = 7 * 1024 * 1024;

  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch (_) {
      return "unknown-page";
    }
  }

  function pageKey(value) {
    return normalizeUrl(value).toLowerCase();
  }

  function compactSnapshot(snapshot) {
    const copy = structuredClone(snapshot);
    if (copy.page?.url) {
      copy.page.url = normalizeUrl(copy.page.url);
      copy.page.urlQueryRemoved = copy.page.url !== snapshot.page.url;
    }
    if (copy.resources) {
      copy.resources.slowest = (copy.resources.slowest || []).slice(0, 6);
      copy.resources.largest = (copy.resources.largest || []).slice(0, 6);
      copy.resources.thirdPartyOrigins = (copy.resources.thirdPartyOrigins || []).slice(0, 8);
    }
    if (copy.runtime) {
      copy.runtime.longTasks = (copy.runtime.longTasks || []).slice(-10);
      copy.runtime.longAnimationFrames = (copy.runtime.longAnimationFrames || []).slice(-6);
      copy.runtime.runtimeErrors = (copy.runtime.runtimeErrors || []).slice(-6);
      if (copy.runtime.memory) copy.runtime.memory.samples = (copy.runtime.memory.samples || []).slice(-30);
    }
    return copy;
  }

  function compactPackage(pkg) {
    const copy = structuredClone(pkg);
    copy.evidence.snapshot = compactSnapshot(copy.evidence.snapshot);
    copy.evidence.attachments = (copy.evidence.attachments || []).map(({ content: _content, ...metadata }) => metadata);
    copy.evidence.history = (copy.evidence.history || []).slice(0, 5);
    return copy;
  }

  function emptyStore() {
    return { version: 1, pages: {} };
  }

  function allRecords(store) {
    return Object.entries(store.pages).flatMap(([key, page]) => (page.records || []).map((record) => ({ key, record })));
  }

  function prune(store) {
    for (const page of Object.values(store.pages)) page.records = (page.records || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_PAGE_RUNS);
    let ordered = allRecords(store).sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt));
    const allowed = new Set(ordered.slice(0, MAX_TOTAL_RUNS).map((item) => item.record.runId));
    for (const [key, page] of Object.entries(store.pages)) {
      page.records = page.records.filter((record) => allowed.has(record.runId));
      if (!page.records.length) delete store.pages[key];
    }
    ordered = allRecords(store).sort((a, b) => a.record.createdAt.localeCompare(b.record.createdAt));
    while (JSON.stringify(store).length > TARGET_BYTES && ordered.length > 1) {
      const oldest = ordered.shift();
      const page = store.pages[oldest.key];
      page.records = page.records.filter((record) => record.runId !== oldest.record.runId);
      if (!page.records.length) delete store.pages[oldest.key];
    }
    return store;
  }

  async function readStore() {
    const value = await chrome.storage.local.get({ [STORAGE_KEY]: emptyStore() });
    const store = value[STORAGE_KEY];
    return store?.version === 1 && store.pages ? store : emptyStore();
  }

  async function writeStore(store) {
    await chrome.storage.local.set({ [STORAGE_KEY]: prune(store) });
  }

  async function save(pkg, score) {
    const store = await readStore();
    const snapshot = pkg.evidence.snapshot;
    const key = pageKey(snapshot.page.url);
    store.pages[key] ||= { url: normalizeUrl(snapshot.page.url), title: snapshot.page.title || "无标题页面", records: [] };
    const record = {
      runId: pkg.reportId,
      reportId: pkg.reportId,
      createdAt: snapshot.page.measuredAt || pkg.generatedAt,
      score,
      title: snapshot.page.title || "无标题页面",
      url: normalizeUrl(snapshot.page.url),
      metrics: {
        lcp: snapshot.timing.lcp ?? null,
        inp: snapshot.timing.inp ?? null,
        cls: snapshot.timing.cls ?? null,
        ttfb: snapshot.timing.ttfb ?? null,
        memoryBytes: snapshot.runtime.processMemory?.privateMemory || snapshot.runtime.memory?.pageMemory?.bytes || snapshot.runtime.memory?.usedJSHeapSize || null,
        memoryRisk: snapshot.runtime.memory?.risk?.level || "insufficient",
      },
      auditCount: pkg.evidence.audits.length,
      diagnosed: Boolean(pkg.optimizationPlan),
      package: compactPackage(pkg),
    };
    const records = store.pages[key].records;
    const existing = records.findIndex((item) => item.runId === record.runId);
    if (existing >= 0) records[existing] = record;
    else records.unshift(record);
    store.pages[key].title = record.title;
    await writeStore(store);
    return record;
  }

  async function list(url) {
    const store = await readStore();
    return (store.pages[pageKey(url)]?.records || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async function remove(url, runId) {
    const store = await readStore();
    const key = pageKey(url);
    if (!store.pages[key]) return;
    store.pages[key].records = store.pages[key].records.filter((record) => record.runId !== runId);
    if (!store.pages[key].records.length) delete store.pages[key];
    await writeStore(store);
  }

  async function clear(url) {
    const store = await readStore();
    delete store.pages[pageKey(url)];
    await writeStore(store);
  }

  global.PerfLensHistory = { STORAGE_KEY, normalizeUrl, pageKey, compactSnapshot, compactPackage, prune, save, list, remove, clear };
})(globalThis);
