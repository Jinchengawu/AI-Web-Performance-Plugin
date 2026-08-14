<div align="center">

# PerfLens

**An open-source browser-to-code performance workspace for measuring real pages, diagnosing evidence with AI, applying source fixes, and verifying the next run.**

<img src="./docs/assets/perflens-popup.png" alt="PerfLens Chrome popup showing persisted run history, Web Vitals, audit coverage, memory runtime, and environment context" width="430" />

[![CI](https://github.com/Jinchengawu/AI-Web-Performance-Plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/Jinchengawu/AI-Web-Performance-Plugin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/Jinchengawu/AI-Web-Performance-Plugin?style=flat-square&color=blue)](./LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-1a73e8?style=flat-square&logo=googlechrome&logoColor=white)](./manifest.json)
[![Version](https://img.shields.io/badge/version-0.4.0-0b7285?style=flat-square)](./manifest.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](./CONTRIBUTING.md)

[English](./README.md) · [中文文档](./README.zh-CN.md)

</div>

---

## Contents

| Discover | Install & use | Build together |
|---|---|---|
| [What PerfLens is](#what-perflens-is)<br>[Product surfaces](#product-surfaces)<br>[What it measures](#what-it-measures)<br>[How the loop works](#how-the-loop-works) | [Quick start](#quick-start)<br>[Chrome extension](#a--chrome-extension)<br>[Codex plugin](#b--codex-plugin)<br>[VS Code / Cursor](#c--vs-code--cursor-extension)<br>[Model providers](#model-providers) | [Privacy & evidence](#privacy--evidence-boundaries)<br>[Development](#development)<br>[Repository layout](#repository-layout)<br>[Contributing](#contributing)<br>[License](#license) |

---

## What PerfLens is

PerfLens is a **three-surface, one-protocol** toolkit for frontend quality work:

1. Measure a real page in Chrome.
2. Run deterministic performance, SEO, accessibility, security, and quality checks.
3. Ask OpenAI, DeepSeek, Anthropic, or an OpenAI-compatible endpoint for a structured Optimization Plan.
4. Export a versioned `perflens.audit-package`.
5. Let Codex, VS Code, or Cursor connect findings to the source repository and apply reviewable fixes.
6. Re-measure the page and compare the new run with its baseline.

It is not a Lighthouse replacement. PerfLens records the current browser session and its environment; Lighthouse remains useful for controlled lab throttling.

## Product surfaces

<table>
<tr>
<td width="33%" valign="top">
<strong>Chrome Probe</strong><br/>
<sub>Measure / audit / diagnose</sub><br/><br/>
Collects live Web Vitals, navigation, resource, DOM, memory, browser, operating-system, and network evidence. Persists page-level run history locally.
</td>
<td width="33%" valign="top">
<strong>Codex Plugin</strong><br/>
<sub>Trace / change / verify</sub><br/><br/>
Imports the Audit Package, maps evidence to the open repository, implements minimal fixes, runs checks, and exports a Fix Session.
</td>
<td width="33%" valign="top">
<strong>VS Code / Cursor</strong><br/>
<sub>Review / apply / hand back</sub><br/><br/>
Shows findings in the editor, creates uniquely anchored patches, requires explicit review, and hands verification evidence back to Chrome.
</td>
</tr>
</table>

## Highlights

- **Real session evidence** — measures the page you are actually using instead of silently simulating a different device or network.
- **Persistent run ledger** — keeps up to 20 runs per page and 120 globally in `chrome.storage.local`; query strings and fragments are removed before storage.
- **Memory risk, not memory theatre** — samples JS Heap every 5 seconds, estimates page memory when available, optionally reads renderer private memory, and separates high footprint from leak risk.
- **43 deterministic rules** — performance, memory, SEO, accessibility, security, and engineering quality with evaluated / passed / failed / unavailable coverage.
- **Structured diagnosis** — every provider returns the same versioned Optimization Plan instead of free-form Markdown.
- **Portable handoff** — JSON is the source of truth; Markdown is a readable adapter.
- **Evidence-driven repair** — the editor and Codex flows preserve report IDs, finding IDs, verification commands, file hashes, and remaining unknowns.

## What it measures

### Performance and runtime

- Core Web Vitals: LCP, high-percentile INP, CLS session windows
- Navigation: redirects, DNS, TCP, TLS, request / TTFB, download, FCP, DOMContentLoaded, Load
- Main thread: Long Tasks, estimated Total Blocking Time, Long Animation Frames, script attribution
- Resources: waterfall, transfer and decoded sizes, compression, cache signals, protocol, largest and slowest resources, third-party origins
- Page shape: DOM count and depth, images, scripts, stylesheets, forms, links, and LCP element attribution

### Memory and test environment

- JS Heap samples, peak, delta, growth slope, monotonic-growth ratio, and observation duration
- `measureUserAgentSpecificMemory()` when the page is cross-origin isolated and the API is available
- Optional Chrome renderer `privateMemory` after an explicit `processes` permission request
- Browser version, OS version and architecture, logical CPU count, device-memory hint
- Viewport, screen size, DPR, color depth, network type, downlink, RTT, Save-Data, protocol, timezone, and isolation state

> Memory values have different scopes and are not interchangeable: **JS Heap** describes the JavaScript heap visible to the page; the **page estimate** can include the page and same-origin workers when the browser API is available; **renderer private memory** is an operating-system process value and can include work shared by renderer tasks. PerfLens samples JS Heap every 5 seconds and only enables its trend classifier after at least 5 usable samples spanning 30 seconds. That threshold gathers evidence—it does not prove a leak. Garbage collection, navigation, and workload must be controlled, and Heap Snapshots plus retention paths remain necessary for root-cause analysis.

### SEO, accessibility, and quality

- Title, description, canonical URL, robots / noindex, language, viewport, charset
- H1 count, heading order, Open Graph, Twitter Card, hreflang, JSON-LD, Meta Refresh
- Image alt text and dimensions, form labels, button / link names, iframe titles, duplicate IDs, main landmarks
- Mixed content, unsafe `_blank` links, synchronous scripts, runtime errors, resource count and weight

## How the loop works

```text
Chrome run history
  → live Performance Snapshot + 43-rule audit
  → AI Optimization Plan
  → Portable Audit Package (.json)
  → Codex or VS Code / Cursor
  → reviewed source changes + local checks
  → Fix Session (.json)
  → Chrome recapture
  → metric delta + resolved / new / remaining findings
```

The contract is documented in [ADR-0001](./docs/adr/0001-portable-audit-package.md).

---

## Quick start

The fastest development path is the unpacked Chrome extension:

```bash
git clone https://github.com/Jinchengawu/AI-Web-Performance-Plugin.git
cd AI-Web-Performance-Plugin
npm ci
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the repository root. Refresh the target page before measuring so the runtime observers start at navigation time.

### First complete loop

> The current extension UI is Chinese-only; the exact button labels are retained below with English explanations.

1. Open the popup and click **采集性能快照** (Collect performance snapshot). Continue using the page and collect again if you need a longer memory trend.
2. Optionally click **大模型诊断** (AI diagnosis), then click **结构化 JSON** (Structured JSON) to download the Audit Package to the browser's configured Downloads folder.
3. Give that file's absolute path to `$perflens-optimize`, or run **PerfLens: 导入结构化报告** (Import structured report) in VS Code / Cursor.
4. Review and apply the source changes, run the proposed checks, then export a **Fix Session**.
5. Refresh the changed page. In Chrome, click **导入报告** (Import report) and select both the baseline Audit Package and Fix Session, click **采集性能快照** again, and inspect the metric and finding comparison.

## Install

| # | Surface | Best for | Installation |
|---|---|---|---|
| A | Chrome extension | Live page measurement and AI diagnosis | Load the repository root as an unpacked MV3 extension |
| B | Codex plugin | Audit-to-code repair in a Codex task | Add this repository as a Codex marketplace |
| C | VS Code / Cursor extension | Findings tree and reviewed patch application | Install the VSIX from GitHub Releases |

### A · Chrome extension

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose the repository root.
4. Refresh the page under test.
5. Keep interacting for at least 30 seconds when investigating memory growth, then collect another run.
6. Choose a model provider and add its API key only when AI diagnosis is needed.

Click **Enable process memory** if renderer-level memory is required. The permission is optional; unsupported Chrome channels fall back to page-memory and JS Heap evidence.

### B · Codex plugin

The commands below were locally verified with Codex CLI `0.147.0-alpha.6.5` on 2026-08-14. Plugin marketplace support is required; command syntax may change in later Codex builds.

```bash
codex plugin marketplace add Jinchengawu/AI-Web-Performance-Plugin
codex plugin add perflens@perflens
```

Start a new Codex task after installation, then invoke:

```text
Use $perflens-optimize to import /absolute/path/perflens-audit.json,
implement the safe P0/P1 fixes, run verification, and export a Fix Session.
```

Plugin source: [`plugins/perflens/`](./plugins/perflens/)

### C · VS Code / Cursor extension

The currently published binary is [`perflens-optimizer-0.1.0.vsix`](https://github.com/Jinchengawu/AI-Web-Performance-Plugin/releases/download/v0.3.0/perflens-optimizer-0.1.0.vsix) from release `v0.3.0` (SHA-256 `3ba0e4e42379a4d7b6161aea443b48d02a192ad356cd590188376a4ff792a39a`). The current `main` branch and Chrome extension are already `v0.4.0`; build the editor extension from source when you need the repository's latest code:

```bash
cd editor-extension
npx @vscode/vsce package
```

Install the resulting VSIX with **Extensions: Install from VSIX…**. The extension declares VS Code `^1.90.0`; Cursor uses the same API surface but is not independently exercised in CI.

The editor extension stores keys in SecretStorage, rejects paths outside the workspace, accepts only unique source matches, and requires review before applying changes. See [`editor-extension/README.md`](./editor-extension/README.md).

## Model providers

The following are configurable source defaults as of 2026-08-14, not a promise that a model is enabled for every provider account. Change the model or endpoint when provider availability differs.

| Preset | Default endpoint | Default model | Protocol |
|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-5.6-luna` | Responses API |
| DeepSeek | `https://api.deepseek.com` | `deepseek-v4-flash` | Chat Completions |
| Anthropic / Claude | `https://api.anthropic.com` | `claude-opus-4-8` | Messages API |
| OpenAI-compatible | Custom | Custom | Chat Completions |

Claude Code is an agent product rather than a separate model protocol. PerfLens supports the Anthropic Messages protocol it uses, plus compatible gateways. OpenAI-compatible mode may use a local endpoint without an API key.

---

## Privacy & evidence boundaries

| Surface | Stored locally | Sent only on user action | Exported | Boundary / deletion |
|---|---|---|---|---|
| Chrome | Provider settings and bounded snapshots, audits, coverage, plan metadata, and attachment metadata in `chrome.storage.local` | **大模型诊断** sends the sanitized snapshot, audits, coverage, up to 5 history summaries, and up to 8 imported attachment bodies within a 160k-character budget to the configured endpoint | Audit Package contains snapshot, audits, coverage, up to 5 history summaries, imported evidence, plan, provider metadata, and comparison | URL query/fragment is removed; keys are never exported. History keeps 20 runs per page / 120 globally, prunes near 7 MB, and remains until **清空**, extension-data removal, or uninstall |
| VS Code / Cursor | API key in SecretStorage; settings in the editor; report and pending patch state in the extension host | **PerfLens: 对话并生成优化补丁** sends the plan, `package.json`, and ranked source context (up to 12 files / 160k characters by default) to the configured endpoint | Fix Session contains report/finding IDs, changed file paths, reasons, verification, suggested commands, and result hashes—no key or source body | Applying changes requires review; workspace-external paths and ambiguous source matches are rejected |
| Codex | The plugin reads the selected package and workspace inside the active Codex environment; it has no separate API key or MCP server | Source handling follows the user's Codex host, account, and model policy when `$perflens-optimize` is invoked | Fix Session records paths, reasons, finding IDs, SHA-256 values, and verification—no source body | A local Audit Package is not a promise of offline execution; use the applicable Codex data controls |

Imported reports, page text, resource names, and source code are treated as untrusted evidence, never as instructions. An OpenAI-compatible endpoint can stay on-device only when the configured endpoint itself is local; otherwise diagnosis is a network request. Renderer memory is requested only after explicit permission and never exposes process termination controls.

For public deployment, use a backend token broker, short-lived credentials, rate limits, consent, retention controls, and cost auditing.

Read [`SECURITY.md`](./SECURITY.md) before shipping a hosted or organization-wide build.

## Compatibility

Verification baseline: 2026-08-14. CI uses Node `22`; local browser verification used Playwright `1.58.2`. See the [CI workflow](./.github/workflows/ci.yml) for the executable matrix.

| Surface / input | Status | Notes |
|---|---|---|
| Chrome MV3 | ✅ Browser-tested | `http(s)` pages; browser-internal pages cannot be injected |
| Codex Plugin | ✅ Locally validated | Codex CLI `0.147.0-alpha.6.5`; marketplace manifest + `$perflens-optimize` Skill |
| VS Code | ✅ Logic-tested | Extension engine `^1.90.0` |
| Cursor | ◐ Compatible surface | Uses the VS Code extension API; not independently CI-tested |
| Lighthouse / PageSpeed JSON | ✅ Fixture-tested | Imported as normalized external evidence |
| HTML / Markdown / CSV / TXT / generic JSON | ✅ Supported | 2 MB per file, up to 8 attachments |

## Development

Prerequisites: run from the repository root with Node `22` and npm `10` (the CI baseline). Install the Playwright Chromium binary once before the browser suite:

```bash
npm ci
npx playwright install chromium

# Syntax, protocol, provider, history, memory, editor, and plugin tests
npm test

# Real MV3 loading and browser workflow via Playwright Chromium
npm run test:browser
```

Linux CI uses `npx playwright install --with-deps chromium` and `xvfb-run`; a normal local desktop does not need `xvfb-run`. Focused checks can be run with `node test/history_test.js`, `node test/memory_test.js`, `node test/model_adapters_test.js`, `node test/protocol_test.js`, or `node editor-extension/test/run.js`.

The linked [GitHub Actions workflow](./.github/workflows/ci.yml) runs both suites on every push and pull request.

## Repository layout

```text
probes/                 Performance observers, snapshots, memory, deterministic audits
shared/                 Report protocol, evidence intake, history store, baseline comparison
background.js           Structured diagnosis and model-provider adapters
popup.*                 Chrome UI adapter
editor-extension/       VS Code / Cursor repair adapter
plugins/perflens/       Codex plugin and perflens-optimize Skill
docs/adr/               Architecture decisions
test/                   Unit fixtures and real-browser integration tests
```

## Known limits

- A live session snapshot is not a CPU/network-throttled Lighthouse lab run.
- INP remains unavailable until the user interacts with the page.
- Cross-origin resources may hide size and timing without `Timing-Allow-Origin`.
- Page-memory estimation requires a secure, cross-origin-isolated document and browser support.
- Renderer private memory depends on the optional Chrome `processes` API and may include work shared by renderer tasks.
- The 5-sample / 30-second memory threshold only enables trend classification; values from JS Heap, page estimate, and renderer private memory must not be compared as the same measurement.
- Memory-risk classification narrows investigation; it does not replace DevTools Heap Snapshots or retained-object analysis.
- Editor repair currently uses unique text replacement; AST / codemod adapters remain future work.

## Contributing

Issues and pull requests are welcome. Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before changing probes, protocol fields, provider adapters, or repair behavior.

Please include:

- the user impact and evidence behind the change;
- tests for behavior changes;
- browser coverage when modifying collection or popup behavior;
- no live API keys, private reports, source context, or customer data.

## License

[MIT](./LICENSE) © [Jinchengawu](https://github.com/Jinchengawu)
