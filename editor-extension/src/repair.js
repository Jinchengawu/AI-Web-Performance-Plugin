const fs = require("fs");
const path = require("path");

const SOURCE_GLOB = "**/*.{js,jsx,ts,tsx,vue,svelte,html,css,scss,less,json}";
const EXCLUDE_GLOB = "**/{node_modules,dist,build,coverage,.git,.next,.nuxt}/**";

function rankUri(uri, hints) {
  const candidate = uri.fsPath.toLowerCase();
  return hints.reduce((score, hint) => score + (candidate.includes(String(hint).toLowerCase()) ? 10 : 0), 0);
}

async function collectContext(vscode, report, maxFiles) {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) throw new Error("请先打开目标前端工程目录。");
  const hints = (report.optimizationPlan.findings || []).flatMap((finding) => (finding.actions || []).flatMap((action) => action.targetHints || []));
  const uris = await vscode.workspace.findFiles(SOURCE_GLOB, EXCLUDE_GLOB, 120);
  uris.sort((a, b) => rankUri(b, hints) - rankUri(a, hints));
  const selected = uris.slice(0, maxFiles);
  const root = folders[0].uri.fsPath;
  const files = [];
  let budget = 160_000;
  for (const uri of selected) {
    if (budget <= 0) break;
    const stat = fs.statSync(uri.fsPath);
    if (stat.size > 180_000) continue;
    const content = fs.readFileSync(uri.fsPath, "utf8").slice(0, Math.min(30_000, budget));
    budget -= content.length;
    files.push({ path: path.relative(root, uri.fsPath).replaceAll(path.sep, "/"), content });
  }
  const packageFile = path.join(root, "package.json");
  const packageJson = fs.existsSync(packageFile) ? fs.readFileSync(packageFile, "utf8").slice(0, 20_000) : null;
  return { root, packageJson, files };
}

function validateRepairPlan(value) {
  if (!value || typeof value !== "object") throw new Error("修复计划必须是 JSON 对象。");
  const changes = (Array.isArray(value.changes) ? value.changes : []).slice(0, 30).map((change) => ({
    file: String(change.file || ""),
    find: String(change.find || ""),
    replace: String(change.replace ?? ""),
    reason: String(change.reason || ""),
    findingIds: Array.isArray(change.findingIds) ? change.findingIds.map(String) : [],
  })).filter((change) => change.file && change.find);
  return {
    summary: String(value.summary || "模型生成的优化补丁"),
    changes,
    suggestedCommands: (Array.isArray(value.suggestedCommands) ? value.suggestedCommands : []).map(String).slice(0, 10),
    verification: (Array.isArray(value.verification) ? value.verification : []).map(String).slice(0, 20),
  };
}

function resolveSafePath(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  const prefix = `${path.resolve(root)}${path.sep}`;
  if (!resolved.startsWith(prefix)) throw new Error(`拒绝工作区外路径：${relativePath}`);
  return resolved;
}

function prepareChanges(root, repairPlan) {
  return repairPlan.changes.map((change) => {
    const filePath = resolveSafePath(root, change.file);
    if (!fs.existsSync(filePath)) return { ...change, filePath, valid: false, error: "文件不存在" };
    const content = fs.readFileSync(filePath, "utf8");
    const first = content.indexOf(change.find);
    const second = first >= 0 ? content.indexOf(change.find, first + change.find.length) : -1;
    if (first < 0) return { ...change, filePath, valid: false, error: "找不到模型引用的原文" };
    if (second >= 0) return { ...change, filePath, valid: false, error: "原文出现多次，无法安全定位" };
    return { ...change, filePath, content, start: first, end: first + change.find.length, valid: true };
  });
}

module.exports = { SOURCE_GLOB, EXCLUDE_GLOB, collectContext, validateRepairPlan, resolveSafePath, prepareChanges };
