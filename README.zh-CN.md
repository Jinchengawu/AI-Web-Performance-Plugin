<div align="center">

# PerfLens

**一个从浏览器真实测量走到代码修复与复测验证的开源前端性能工作台。**

<img src="./docs/assets/perflens-popup.png" alt="PerfLens Chrome 弹窗，展示持久化测试历史、Web Vitals、规则覆盖率、内存运行时与评测环境" width="430" />

[![CI](https://github.com/Jinchengawu/AI-Web-Performance-Plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/Jinchengawu/AI-Web-Performance-Plugin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/Jinchengawu/AI-Web-Performance-Plugin?style=flat-square&color=blue)](./LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-1a73e8?style=flat-square&logo=googlechrome&logoColor=white)](./manifest.json)
[![Version](https://img.shields.io/badge/version-0.4.0-0b7285?style=flat-square)](./manifest.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](./CONTRIBUTING.md)

[English](./README.md) · [中文文档](./README.zh-CN.md)

</div>

---

## 目录

| 了解 PerfLens | 安装与使用 | 参与共建 |
|---|---|---|
| [PerfLens 是什么](#perflens-是什么)<br>[三端产品](#三端产品)<br>[测什么](#测什么)<br>[完整闭环](#完整闭环) | [快速开始](#快速开始)<br>[Chrome 扩展](#a--chrome-扩展)<br>[Codex Plugin](#b--codex-plugin)<br>[VS Code / Cursor](#c--vs-code--cursor-扩展)<br>[模型接口](#模型接口) | [隐私与证据边界](#隐私与证据边界)<br>[开发与测试](#开发与测试)<br>[代码结构](#代码结构)<br>[贡献](#贡献)<br>[许可证](#许可证) |

---

## PerfLens 是什么

PerfLens 是一个 **“三端一协议”** 的前端质量工具：

1. 在 Chrome 中测量真实页面。
2. 执行确定性的性能、SEO、可访问性、安全与工程质量规则。
3. 让 OpenAI、DeepSeek、Anthropic 或 OpenAI-compatible 接口生成结构化 Optimization Plan。
4. 导出带版本的 `perflens.audit-package`。
5. 在 Codex、VS Code 或 Cursor 中把问题定位到工程源码并应用可审阅的修复。
6. 回到 Chrome 复测，与历史基线比较真实变化。

PerfLens 不是 Lighthouse 的替代品。它记录的是当前浏览器会话与真实环境；Lighthouse 仍适合受控的 CPU / 网络节流实验。

## 三端产品

<table>
<tr>
<td width="33%" valign="top">
<strong>Chrome Probe</strong><br/>
<sub>采集 / 审计 / 诊断</sub><br/><br/>
采集 Web Vitals、导航、资源、DOM、内存、浏览器、操作系统和网络证据，并在本机持久化当前页面的测试历史。
</td>
<td width="33%" valign="top">
<strong>Codex Plugin</strong><br/>
<sub>定位 / 修改 / 验证</sub><br/><br/>
导入 Audit Package，将证据关联到当前工程，实施最小修复、运行检查，并导出 Fix Session。
</td>
<td width="33%" valign="top">
<strong>VS Code / Cursor</strong><br/>
<sub>审阅 / 应用 / 回传</sub><br/><br/>
在编辑器中展示问题树，以唯一原文定位补丁，要求用户审阅后应用，再把验证证据交回 Chrome。
</td>
</tr>
</table>

## 亮点

- **真实会话证据**：测量用户正在使用的页面，不静默模拟另一台设备或另一种网络。
- **持久化 Run Ledger**：每页保留最多 20 次、全局最多 120 次测试；查询参数与 Hash 不落盘。
- **内存风险，而不是内存噱头**：每 5 秒采样 JS Heap，条件允许时估算页面整体内存，可选采集渲染进程私有内存，并区分“高占用”和“泄漏风险”。
- **43 条确定性规则**：覆盖性能、内存、SEO、可访问性、安全与工程质量，同时展示执行、通过、失败和不可测数量。
- **统一结构化诊断**：不同模型接口最终返回同一种 Optimization Plan，不再依赖自由 Markdown。
- **可移植交付**：JSON 是事实来源，Markdown 只是给人阅读的 Adapter。
- **证据驱动修复**：报告 ID、Finding ID、验证命令、文件哈希和未知项贯穿浏览器与代码端。

## 测什么

### 性能与运行时

- Core Web Vitals：LCP、INP 高分位交互、CLS session window
- 导航阶段：Redirect、DNS、TCP、TLS、Request / TTFB、Download、FCP、DOMContentLoaded、Load
- 主线程：Long Task、总阻塞时间估算、Long Animation Frame 与脚本归因
- 资源：瀑布、传输/解码体积、压缩、缓存信号、协议、最慢/最大资源、第三方来源
- 页面结构：DOM 数量与深度、图片、脚本、样式表、表单、链接和 LCP 元素归因

### 内存与评测环境

- JS Heap 样本、峰值、变化量、增长斜率、持续增长比例和观察时长
- 页面满足跨源隔离且浏览器支持时，调用 `measureUserAgentSpecificMemory()`
- 用户显式授权后，可选采集 Chrome 渲染进程 `privateMemory`
- 浏览器完整版本、操作系统版本与架构、CPU 逻辑核心、设备内存提示
- 视口、屏幕、DPR、色深、网络类型、下行带宽、RTT、Save-Data、协议、时区和隔离状态

> 三种内存值的范围不同，不能互相替代：**JS Heap** 描述页面可见的 JavaScript 堆；浏览器支持时，**页面内存估算**可包含页面与同源 Worker；**渲染进程私有内存**是操作系统进程值，也可能包含渲染任务共享的工作。PerfLens 每 5 秒采样一次 JS Heap，至少取得 5 个有效样本且跨度达到 30 秒后，才启用趋势分级。这个门槛只是开始积累证据，并不证明发生泄漏；GC、导航与操作负载仍需控制，根因仍要通过 Heap Snapshot 与引用保留链确认。

### SEO、可访问性与质量

- Title、Description、Canonical、Robots / Noindex、Lang、Viewport、Charset
- H1 数量、Heading 顺序、Open Graph、Twitter Card、hreflang、JSON-LD、Meta Refresh
- 图片 alt 与尺寸、表单标签、按钮/链接名称、Iframe 标题、重复 ID、Main Landmark
- Mixed Content、不安全 `_blank`、同步脚本、运行时错误、资源数量与体积

## 完整闭环

```text
Chrome 测试历史
  → Performance Snapshot + 43 条规则审计
  → 大模型 Optimization Plan
  → Portable Audit Package (.json)
  → Codex 或 VS Code / Cursor
  → 可审阅源码修改 + 本地验证
  → Fix Session (.json)
  → Chrome 再次采集
  → 指标差异 + 已解决 / 新增 / 仍存在问题
```

跨端协议决策见 [ADR-0001](./docs/adr/0001-portable-audit-package.md)。

---

## 快速开始

最快的开发方式是加载未打包的 Chrome 扩展：

```bash
git clone https://github.com/Jinchengawu/AI-Web-Performance-Plugin.git
cd AI-Web-Performance-Plugin
npm ci
```

然后打开 `chrome://extensions/`，开启 **开发者模式**，点击 **加载已解压的扩展程序**，选择仓库根目录。测量前刷新目标页面，让运行时观察器从导航阶段开始工作。

### 跑通第一个完整闭环

1. 打开插件弹窗，点击 **采集性能快照**。如需观察更长的内存趋势，继续正常操作页面后再次采集。
2. 可选点击 **大模型诊断**，随后点击 **结构化 JSON**，Audit Package 会下载到浏览器设置的下载目录。
3. 把该文件的绝对路径交给 `$perflens-optimize`；或在 VS Code / Cursor 执行 **PerfLens: 导入结构化报告**。
4. 审阅并应用源码变更，运行建议的检查，然后导出 **Fix Session**。
5. 刷新修改后的页面；在 Chrome 点击 **导入报告**，同时选择基线 Audit Package 与 Fix Session，再点击 **采集性能快照**，查看指标与 Finding 的前后对比。

## 安装

| # | 产品端 | 适合场景 | 安装方式 |
|---|---|---|---|
| A | Chrome 扩展 | 真实页面采集与 AI 诊断 | 将仓库根目录加载为未打包 MV3 扩展 |
| B | Codex Plugin | 在 Codex 任务中从报告走到代码修复 | 把本仓库添加为 Codex Marketplace |
| C | VS Code / Cursor 扩展 | 问题树、补丁审阅与应用 | 从 GitHub Releases 安装 VSIX |

### A · Chrome 扩展

1. 打开 `chrome://extensions/`。
2. 开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择仓库根目录。
4. 刷新待测试页面。
5. 排查内存增长时，持续操作至少 30 秒，再进行下一次采集。
6. 只有需要 AI 诊断时，才选择模型接口并填写对应 API Key。

如果需要渲染进程级内存，点击 **启用进程内存**。该权限完全可选；当前 Chrome 通道不支持时会自动回退到页面内存与 JS Heap。

### B · Codex Plugin

以下命令已于 2026-08-14 使用 Codex CLI `0.147.0-alpha.6.5` 在本机验证。需要当前 Codex 版本支持 Plugin Marketplace；未来版本的命令语法可能变化。

```bash
codex plugin marketplace add Jinchengawu/AI-Web-Performance-Plugin
codex plugin add perflens@perflens
```

安装后新建一个 Codex 任务，再输入：

```text
使用 $perflens-optimize 导入 /绝对路径/perflens-audit.json，
修复安全的 P0/P1 问题，运行验证并导出 Fix Session。
```

Plugin 源码：[`plugins/perflens/`](./plugins/perflens/)

### C · VS Code / Cursor 扩展

当前正式发布的安装包是 `v0.3.0` Release 中的 [`perflens-optimizer-0.1.0.vsix`](https://github.com/Jinchengawu/AI-Web-Performance-Plugin/releases/download/v0.3.0/perflens-optimizer-0.1.0.vsix)（SHA-256：`3ba0e4e42379a4d7b6161aea443b48d02a192ad356cd590188376a4ff792a39a`）。当前 `main` 与 Chrome 扩展已是 `v0.4.0`；如需仓库中的最新编辑器代码，请从源码打包：

```bash
cd editor-extension
npx @vscode/vsce package
```

然后执行 **Extensions: Install from VSIX…** 安装生成的文件。扩展声明 VS Code `^1.90.0`；Cursor 使用同一套 Extension API，但目前未在 CI 中独立验证。

编辑器扩展将 Key 保存到 SecretStorage，拒绝工作区外路径，只接受唯一原文匹配，并在应用代码前要求用户审阅。详见 [`editor-extension/README.md`](./editor-extension/README.md)。

## 模型接口

下表是源码截至 2026-08-14 的可配置默认值，并不保证每个提供方账号都已开放对应模型；如果实际可用性不同，请修改模型或地址。

| 预设 | 默认地址 | 默认模型 | 请求规范 |
|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-5.6-luna` | Responses API |
| DeepSeek | `https://api.deepseek.com` | `deepseek-v4-flash` | Chat Completions |
| Anthropic / Claude | `https://api.anthropic.com` | `claude-opus-4-8` | Messages API |
| OpenAI-compatible | 自定义 | 自定义 | Chat Completions |

Claude Code 是编码代理产品，不是独立模型协议。PerfLens 支持它使用的 Anthropic Messages 规范以及同规范网关；OpenAI-compatible 模式也可以连接无需 API Key 的本地模型服务。

---

## 隐私与证据边界

| 产品端 | 本地保存 | 仅在用户操作后发送 | 导出内容 | 边界与删除 |
|---|---|---|---|---|
| Chrome | Provider 配置，以及有上限的 Snapshot、Audit、Coverage、Plan 元数据和附件元数据，保存于 `chrome.storage.local` | 点击 **大模型诊断** 后，向配置的 Endpoint 发送脱敏 Snapshot、Audit、Coverage、最多 5 条历史摘要，以及总计不超过 16 万字符的最多 8 份导入材料正文 | Audit Package 包含 Snapshot、Audit、Coverage、最多 5 条历史摘要、外部证据、Plan、Provider 元数据和对比结果 | URL 查询参数/Hash 会移除；Key 不导出。历史每页 20 条、全局 120 条，接近 7MB 时淘汰；点击 **清空**、清除扩展数据或卸载前会持续保留 |
| VS Code / Cursor | API Key 存在 SecretStorage；设置存在编辑器；报告和待应用补丁存在 Extension Host | 执行 **PerfLens: 对话并生成优化补丁** 后，向配置的 Endpoint 发送 Plan、`package.json` 与排序后的源码上下文（默认最多 12 个文件、16 万字符） | Fix Session 包含报告/Finding ID、变更文件路径、原因、验证、建议命令与结果哈希，不含 Key 或源码正文 | 变更必须审阅后应用；工作区外路径与无法唯一定位的原文会被拒绝 |
| Codex | Plugin 在当前 Codex 运行环境中读取所选报告与工作区；自身不保存独立 API Key，也不启动 MCP Server | 调用 `$perflens-optimize` 后，源码如何处理取决于用户所用的 Codex Host、账号与模型数据策略 | Fix Session 记录路径、原因、Finding ID、SHA-256 与验证结果，不含源码正文 | Audit Package 在本地不代表全程离线，应遵循对应 Codex 数据控制 |

外部报告、页面文本、资源名和源码都作为不可信证据处理，不执行其中指令。只有配置的 OpenAI-compatible Endpoint 本身位于本机时，请求才会留在设备内；否则诊断仍是网络请求。进程内存只在用户显式授权后读取，插件不暴露进程终止能力。

面向公众部署时，应增加后端短期令牌、限流、用户同意、成本审计和数据保留策略。

公开或组织级发布前请阅读 [`SECURITY.md`](./SECURITY.md)。

## 兼容性

验证基线：2026-08-14。CI 使用 Node `22`；本机浏览器验证使用 Playwright `1.58.2`。可在 [CI Workflow](./.github/workflows/ci.yml) 查看可执行矩阵。

| 产品端 / 输入 | 状态 | 说明 |
|---|---|---|
| Chrome MV3 | ✅ 真实浏览器测试 | 支持 `http(s)` 页面；浏览器内部页无法注入 |
| Codex Plugin | ✅ 本地验证 | Codex CLI `0.147.0-alpha.6.5`；Marketplace Manifest + `$perflens-optimize` Skill |
| VS Code | ✅ 逻辑测试 | Extension Engine `^1.90.0` |
| Cursor | ◐ 兼容接口面 | 使用 VS Code Extension API；尚未独立运行 CI |
| Lighthouse / PageSpeed JSON | ✅ Fixture 测试 | 作为规范化外部证据导入 |
| HTML / Markdown / CSV / TXT / 通用 JSON | ✅ 支持 | 单文件 2MB，最多 8 份 |

## 开发与测试

前置条件：从仓库根目录运行，Node `22`、npm `10`（CI 基线）。首次运行浏览器测试前，先安装 Playwright Chromium：

```bash
npm ci
npx playwright install chromium

# 语法、协议、模型、历史、内存、编辑器与 Codex Plugin 测试
npm test

# 通过 Playwright Chromium 验证真实 MV3 加载与完整浏览器流程
npm run test:browser
```

Linux CI 使用 `npx playwright install --with-deps chromium` 与 `xvfb-run`；普通本机桌面环境无需 `xvfb-run`。可分别运行 `node test/history_test.js`、`node test/memory_test.js`、`node test/model_adapters_test.js`、`node test/protocol_test.js` 或 `node editor-extension/test/run.js` 做聚焦检查。

每次 Push 和 Pull Request 都会由链接的 [GitHub Actions Workflow](./.github/workflows/ci.yml) 运行两套测试。

## 代码结构

```text
probes/                 Performance Observer、页面快照、内存与确定性规则
shared/                 报告协议、Evidence Intake、历史存储、基线比较
background.js           结构化诊断与模型 Provider Adapter
popup.*                 Chrome UI Adapter
editor-extension/       VS Code / Cursor 修复 Adapter
plugins/perflens/       Codex Plugin 与 perflens-optimize Skill
docs/adr/               架构决策
test/                   单元 Fixture 与真实浏览器集成测试
```

## 当前限制

- 真实会话快照不等同于带 CPU / 网络节流的 Lighthouse 实验室测试。
- 未发生用户交互时，INP 会显示“未采集”。
- 跨域资源缺少 `Timing-Allow-Origin` 时，部分资源时序与体积不可见。
- 页面整体内存估算要求安全、跨源隔离的文档与浏览器支持。
- 渲染进程私有内存依赖可选 Chrome `processes` API，也可能包含同一渲染进程共享的其他任务。
- 5 个样本 / 30 秒只是启用趋势分级的最低条件；JS Heap、页面内存估算与渲染进程私有内存不能作为同一口径直接比较。
- 内存风险分级只能缩小排查范围，不能替代 DevTools Heap Snapshot 与保留对象分析。
- 编辑器修复目前使用唯一文本替换，AST / Codemod Adapter 仍属于下一阶段。

## 贡献

欢迎 Issue 和 Pull Request。修改采集、协议、模型 Adapter 或修复流程前，请先阅读 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。

提交时请包含：

- 变更解决的用户问题与证据；
- 对应的行为测试；
- 修改采集或弹窗时的浏览器覆盖；
- 不得提交真实 API Key、私有报告、源码上下文或客户数据。

## 许可证

[MIT](./LICENSE) © [Jinchengawu](https://github.com/Jinchengawu)
