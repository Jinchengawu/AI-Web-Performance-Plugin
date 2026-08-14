const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const chrome = process.env.PERFLENS_CHROME_PATH || chromium.executablePath();

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "perflens-test-"));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: chrome,
    // Chrome currently disables extension loading in the bundled headless shell.
    // This uses an isolated visible window and never touches the user's profile.
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, "--no-first-run"],
  });
  try {
    const errors = [];
    const page = await context.newPage();
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("http://127.0.0.1:8765/test/fixtures/page.html");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);

    const extensions = await context.newPage();
    await extensions.goto("chrome://extensions");
    await extensions.waitForTimeout(1000);
    const extensionId = await extensions.evaluate(() => {
      const manager = document.querySelector("extensions-manager")?.shadowRoot;
      const list = manager?.querySelector("extensions-item-list")?.shadowRoot;
      const items = [...(list?.querySelectorAll("extensions-item") || [])];
      const target = items.find((item) => item.shadowRoot?.querySelector("#name")?.textContent.includes("前端性能诊断台"));
      return target?.getAttribute("id") || null;
    });
    if (!extensionId) throw new Error("PerfLens extension was not loaded by Chrome");
    const popup = await context.newPage();
    popup.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForLoadState("networkidle");
    await page.bringToFront();
    await popup.evaluate(() => document.querySelector("#analyze").click());
    await popup.waitForFunction(() => document.querySelector("#score").textContent !== "—");
    if (!(await popup.locator("#details").isVisible())) throw new Error("Details did not render");
    const details = await popup.locator("#details").innerText();
    if (!details.includes("综合规则覆盖") || !details.includes("SEO")) throw new Error(`Audit summary missing: ${details}`);
    if (!(await popup.locator("#memoryPanel").isVisible())) throw new Error("Memory runtime panel did not render");
    if (!(await popup.locator("#environmentPanel").isVisible())) throw new Error("Environment panel did not render");
    const environment = await popup.locator("#environmentPanel").innerText();
    if (!environment.includes("浏览器") || !environment.includes("操作系统") || !environment.includes("网络")) throw new Error(`Environment evidence missing: ${environment}`);
    const persisted = await popup.evaluate(async () => {
      const value = await chrome.storage.local.get("perflensHistoryV1");
      const records = Object.values(value.perflensHistoryV1?.pages || {}).flatMap((item) => item.records || []);
      return { count: records.length, rules: records[0]?.package?.evidence?.coverage?.rules || 0, hasEnvironment: Boolean(records[0]?.package?.evidence?.snapshot?.environment), hasMemory: Boolean(records[0]?.package?.evidence?.snapshot?.runtime?.memory) };
    });
    if (persisted.count !== 1 || persisted.rules < 40 || !persisted.hasEnvironment || !persisted.hasMemory) throw new Error(`Persisted run incomplete: ${JSON.stringify(persisted)}`);
    await popup.reload();
    await popup.waitForFunction(() => document.querySelectorAll(".history-row").length === 1);
    await page.bringToFront();
    await popup.evaluate(() => document.querySelector("#analyze").click());
    await popup.waitForFunction(() => document.querySelectorAll(".history-row").length === 2);
    if (!(await popup.locator("#reportSection").isVisible())) throw new Error("Deterministic report did not render");
    if (await popup.locator("#reportContent table").count() !== 1) throw new Error("Markdown metrics table did not render");

    await popup.setInputFiles("#evidenceFiles", path.join(root, "test/fixtures/lighthouse.json"));
    await popup.waitForFunction(() => document.querySelectorAll(".evidence-item").length === 1);
    const evidence = await popup.locator(".evidence-item").innerText();
    if (!evidence.toLowerCase().includes("lighthouse")) throw new Error(`Lighthouse adapter failed: ${evidence}`);

    const packagePromise = popup.waitForEvent("download");
    await popup.click("#exportJson");
    const packageDownload = await packagePromise;
    const packagePath = path.join(profile, "baseline.json");
    await packageDownload.saveAs(packagePath);
    await popup.setInputFiles("#evidenceFiles", packagePath);
    await popup.waitForFunction(() => document.querySelectorAll(".evidence-item").length === 2);
    if (!(await popup.locator("#comparison").isVisible())) throw new Error("Baseline comparison did not render");
    await popup.setInputFiles("#evidenceFiles", {
      name: "perflens-fix-session.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ version: "1.0", reportId: "baseline", appliedAt: new Date().toISOString(), changes: [{ file: "src/app.js" }], verification: [] })),
    });
    await popup.waitForFunction(() => document.querySelectorAll(".evidence-item").length === 3);
    const fixEvidence = await popup.locator(".evidence-item").nth(2).innerText();
    if (!fixEvidence.includes("perflens-fix")) throw new Error(`Fix Session adapter failed: ${fixEvidence}`);

    await page.evaluate(() => {
      document.querySelectorAll("h1")[1].remove();
      const image = document.querySelector("img");
      image.alt = "测试图"; image.width = 1; image.height = 1;
      document.querySelector("input").setAttribute("aria-label", "测试输入");
    });
    await page.bringToFront();
    await popup.evaluate(() => document.querySelector("#analyze").click());
    await popup.waitForFunction(() => document.querySelector("#status").textContent.includes("快照已保存"));
    const comparison = await popup.locator("#comparison").innerText();
    if (!comparison.includes("已解决") || comparison.includes("已解决 0")) throw new Error(`Verification delta failed: ${comparison}`);

    const downloadPromise = popup.waitForEvent("download");
    await popup.click("#exportRaw");
    const download = await downloadPromise;
    if (!download.suggestedFilename().startsWith("perflens-raw-")) throw new Error("Raw export filename invalid");
    await popup.screenshot({ path: "/tmp/perflens-product-popup.png", fullPage: true });
    if (errors.length) throw new Error(`Browser console errors: ${errors.join(" | ")}`);
    process.stdout.write(`PerfLens browser integration passed; extension=${extensionId}\n`);
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exit(1); });
