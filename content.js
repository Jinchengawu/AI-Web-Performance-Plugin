chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "COLLECT_METRICS") return false;
  globalThis.PerfLensSnapshot.collect()
    .then((snapshot) => {
      const result = globalThis.PerfLensAudits.evaluate(snapshot);
      sendResponse({ ok: true, data: snapshot, audits: result.findings, coverage: result.coverage });
    })
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
