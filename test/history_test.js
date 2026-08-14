const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let storage = {};
const sandbox = {
  console,
  URL,
  structuredClone,
  chrome: { storage: { local: {
    async get(defaults) { return { ...defaults, ...storage }; },
    async set(value) { storage = { ...storage, ...value }; },
  } } },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("shared/history-store.js", "utf8"), sandbox);

function pkg(id, url, measuredAt) {
  return {
    schema: "perflens.audit-package",
    schemaVersion: "1.1.0",
    reportId: id,
    generatedAt: measuredAt,
    evidence: {
      snapshot: {
        page: { url, title: "History fixture", measuredAt },
        timing: { lcp: 1000, inp: 100, cls: 0.01, ttfb: 200 },
        resources: { slowest: [], largest: [], thirdPartyOrigins: [] },
        runtime: { memory: { samples: [], risk: { level: "stable" }, usedJSHeapSize: 10 }, longTasks: [], longAnimationFrames: [], runtimeErrors: [] },
      },
      audits: [], attachments: [], history: [],
    },
  };
}

(async () => {
  await sandbox.PerfLensHistory.save(pkg("one", "https://example.com/page?secret=1", "2026-08-14T00:00:00Z"), 90);
  await sandbox.PerfLensHistory.save(pkg("two", "https://example.com/page?secret=2", "2026-08-14T00:01:00Z"), 92);
  const records = await sandbox.PerfLensHistory.list("https://example.com/page?anything=3#hash");
  assert.equal(records.length, 2);
  assert.equal(records[0].runId, "two");
  assert.equal(JSON.stringify(storage).includes("secret"), false);
  await sandbox.PerfLensHistory.remove("https://example.com/page", "one");
  assert.equal((await sandbox.PerfLensHistory.list("https://example.com/page")).length, 1);
  for (let index = 0; index < 25; index += 1) {
    await sandbox.PerfLensHistory.save(pkg(`run-${index}`, "https://example.com/page", `2026-08-14T01:${String(index).padStart(2, "0")}:00Z`), 80);
  }
  assert.equal((await sandbox.PerfLensHistory.list("https://example.com/page")).length, 20);
  console.log("PerfLens history persistence tests passed");
})().catch((error) => { console.error(error); process.exit(1); });
