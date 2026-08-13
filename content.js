chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "COLLECT_METRICS") return false;
  try {
    const snapshot = globalThis.PerfLensSnapshot.collect();
    const audits = globalThis.PerfLensAudits.run(snapshot);
    sendResponse({
      ok: true,
      data: snapshot,
      audits,
      coverage: {
        rules: globalThis.PerfLensAudits.ruleCount,
        categories: ["performance", "seo", "accessibility", "quality"],
      },
    });
  } catch (error) {
    sendResponse({ ok: false, error: error.message });
  }
  return false;
});
