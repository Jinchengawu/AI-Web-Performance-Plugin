const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { webcrypto } = require("crypto");

const validPlan = JSON.stringify({ summary: "诊断完成", riskLevel: "medium", findings: [], roadmap: [], unknowns: [] });

async function run(provider) {
  let listener;
  let request;
  const profiles = {
    "openai-responses": { apiKey: "key", apiBase: "https://api.openai.com/v1", model: "gpt-test" },
    deepseek: { apiKey: "key", apiBase: "https://api.deepseek.com", model: "deepseek-test" },
    anthropic: { apiKey: "key", apiBase: "https://api.anthropic.com", model: "claude-test" },
  };
  const sandbox = {
    console,
    URL,
    structuredClone,
    crypto: webcrypto,
    chrome: {
      runtime: { getManifest: () => ({ version: "test" }), onMessage: { addListener: (value) => { listener = value; } } },
      storage: { local: { get: async () => ({ provider, providerProfiles: { [provider]: profiles[provider] } }) } },
    },
    fetch: async (url, options) => {
      request = { url, options };
      const payload = provider === "anthropic"
        ? { content: [{ type: "text", text: validPlan }] }
        : provider === "deepseek"
          ? { choices: [{ message: { content: validPlan } }] }
          : { output_text: validPlan };
      return { ok: true, status: 200, json: async () => payload };
    },
  };
  vm.createContext(sandbox);
  sandbox.importScripts = (...files) => files.forEach((file) => vm.runInContext(fs.readFileSync(file, "utf8"), sandbox));
  vm.runInContext(fs.readFileSync("background.js", "utf8"), sandbox);
  const result = await new Promise((resolve) => listener({
    type: "AI_DIAGNOSE",
    evidence: {
      snapshot: { page: { url: "https://example.com/?secret=1", title: "Test", measuredAt: "2026-08-14T00:00:00Z" } },
      audits: [], attachments: [],
    },
  }, null, resolve));
  assert.equal(result.ok, true);
  assert.equal(result.plan.summary, "诊断完成");
  assert.equal(JSON.stringify(request).includes("secret=1"), false);
  return request;
}

(async () => {
  const openai = await run("openai-responses");
  const deepseek = await run("deepseek");
  const anthropic = await run("anthropic");
  assert(openai.url.endsWith("/v1/responses"));
  assert(deepseek.url.endsWith("/chat/completions"));
  assert(anthropic.url.endsWith("/v1/messages"));
  assert.equal(anthropic.options.headers["anthropic-version"], "2023-06-01");
  console.log("PerfLens model adapter tests passed");
})().catch((error) => { console.error(error); process.exit(1); });
