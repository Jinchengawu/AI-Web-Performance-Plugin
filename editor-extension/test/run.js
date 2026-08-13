const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { validateReport } = require("../src/report");
const { endpoint, extractJson, callModel } = require("../src/model-client");
const { validateRepairPlan, resolveSafePath, prepareChanges } = require("../src/repair");

(async () => {
  assert.equal(endpoint("https://api.openai.com/v1", "/responses"), "https://api.openai.com/v1/responses");
  assert.equal(endpoint("https://api.anthropic.com", "/v1/messages"), "https://api.anthropic.com/v1/messages");
  assert.deepEqual(extractJson("```json\n{\"ok\":true}\n```"), { ok: true });
  assert.equal(validateReport({ schema: "perflens.audit-package", schemaVersion: "1.0.0", evidence: { snapshot: {}, audits: [] }, optimizationPlan: {} }).valid, true);
  const repair = validateRepairPlan({ changes: [{ file: "src/a.js", find: "const slow = true;", replace: "const slow = false;" }] });
  assert.equal(repair.changes.length, 1);
  assert.throws(() => resolveSafePath(path.resolve("/tmp/project"), "../secret"), /工作区外/);

  const project = fs.mkdtempSync(path.join(os.tmpdir(), "perflens-repair-"));
  fs.mkdirSync(path.join(project, "src"));
  fs.writeFileSync(path.join(project, "src/a.js"), "const slow = true;\n");
  const prepared = prepareChanges(project, repair);
  assert.equal(prepared[0].valid, true);
  assert.equal(prepared[0].start, 0);

  const responseText = JSON.stringify({ summary: "ok", changes: [] });
  const cases = [
    ["openai-responses", { output_text: responseText }],
    ["deepseek", { choices: [{ message: { content: responseText } }] }],
    ["anthropic", { content: [{ type: "text", text: responseText }] }],
  ];
  for (const [provider, payload] of cases) {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => payload });
    const value = await callModel({ provider, apiKey: "test", system: "system", prompt: "prompt" });
    assert.equal(value.summary, "ok");
  }
  fs.rmSync(project, { recursive: true, force: true });
  console.log("PerfLens editor tests passed");
})().catch((error) => { console.error(error); process.exit(1); });
