const DEFAULTS = {
  "openai-responses": { apiBase: "https://api.openai.com/v1", model: "gpt-5.6-luna" },
  deepseek: { apiBase: "https://api.deepseek.com", model: "deepseek-v4-flash" },
  anthropic: { apiBase: "https://api.anthropic.com", model: "claude-opus-4-8" },
  "openai-chat": { apiBase: "http://localhost:11434/v1", model: "qwen3-coder" },
};

function endpoint(base, path) {
  const clean = base.replace(/\/+$/, "");
  if (clean.endsWith(path)) return clean;
  if (clean.endsWith("/v1") && path.startsWith("/v1/")) return `${clean}${path.slice(3)}`;
  return `${clean}${path}`;
}

function extractJson(text) {
  const clean = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(clean); } catch (_) {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error("模型没有返回有效 JSON 补丁计划。");
  }
}

async function callModel({ provider, apiBase, model, apiKey, system, prompt }) {
  const defaults = DEFAULTS[provider] || DEFAULTS["openai-responses"];
  apiBase ||= defaults.apiBase;
  model ||= defaults.model;
  let url;
  let headers = { "Content-Type": "application/json" };
  let body;
  let parse;

  if (provider === "anthropic") {
    url = endpoint(apiBase, "/v1/messages");
    headers = { ...headers, "x-api-key": apiKey, Authorization: `Bearer ${apiKey}`, "anthropic-version": "2023-06-01" };
    body = { model, max_tokens: 8192, system, messages: [{ role: "user", content: prompt }] };
    parse = (value) => (value.content || []).filter((item) => item.type === "text").map((item) => item.text).join("\n");
  } else if (provider === "deepseek" || provider === "openai-chat") {
    url = endpoint(apiBase, "/chat/completions");
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    body = { model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }], stream: false };
    parse = (value) => value.choices?.[0]?.message?.content || "";
  } else {
    url = endpoint(apiBase, "/responses");
    headers.Authorization = `Bearer ${apiKey}`;
    body = { model, instructions: system, input: prompt, reasoning: { effort: "medium" } };
    parse = (value) => value.output_text || (value.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n");
  }

  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`模型请求失败（${response.status}）：${payload.error?.message || payload.message || "无详情"}`);
  return extractJson(parse(payload));
}

module.exports = { DEFAULTS, endpoint, extractJson, callModel };
