<div align="center">

# PerfLens

**在真实 Chrome 会话中采集证据，用版本化报告把证据带进代码，再通过下一次浏览器采集验证结果。**

<img src="./docs/assets/perflens-popup.png" alt="PerfLens Chrome 弹窗，展示持久化运行历史、Web Vitals、规则覆盖率、内存运行时与评测环境" width="430" />

[![CI](https://github.com/Jinchengawu/AI-Web-Performance-Plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/Jinchengawu/AI-Web-Performance-Plugin/actions/workflows/ci.yml)
[![状态：Alpha](https://img.shields.io/badge/status-alpha-f59f00?style=flat-square)](#项目状态)
[![版本](https://img.shields.io/badge/source-0.4.0-0b7285?style=flat-square)](./manifest.json)
[![License: MIT](https://img.shields.io/github/license/Jinchengawu/AI-Web-Performance-Plugin?style=flat-square&color=blue)](./LICENSE)

[English](./README.md) · [简体中文](./README.zh-CN.md)

</div>

## 项目状态

> **Alpha。** Chrome 扩展已通过真实浏览器测试，VS Code 扩展已通过逻辑测试，Codex Plugin 已完成本地包结构验证。Cursor 使用 VS Code Extension API，但尚未独立测试。当前界面仅提供中文。

当前源码与 Chrome 扩展版本为 `0.4.0`。最新公开 Release 是 [`v0.3.0`](https://github.com/Jinchengawu/AI-Web-Performance-Plugin/releases/tag/v0.3.0)，其中包含 `0.1.0` 版 VSIX；需要仓库最新代码时，请从源码构建编辑器扩展。

PerfLens 不是 Lighthouse 的替代品。它记录你正在使用的真实浏览器会话；Lighthouse 仍适合受控节流和可重复的合成实验室审计。

## 完整闭环

```text
真实 Chrome 会话
  → Performance Snapshot + 43 条确定性规则
  → 可选的 AI Optimization Plan
  → 版本化 Audit Package (.json)
  → 在 Codex 或 VS Code 中审阅修改
  → Fix Session (.json)
  → Chrome 复测
  → 指标与 Finding 差异
```

JSON 包在不同工具之间保留 Report ID、Finding ID、评测环境、验证命令与结果哈希。本地构建或测试只能证明修改与工程兼容；只有 Chrome 复测才能说明运行时指标是否发生变化。

| 产品端 | 作用 | 截至 2026-08-14 的验证状态 |
|---|---|---|
| Chrome 扩展 | 测量、审计、保存历史、导出与比较 | 已通过 Playwright Chromium 真实浏览器测试 |
| Codex Plugin | 将报告证据映射到源码、实施小范围修复、运行检查、导出 Fix Session | 包结构与 CLI 命令面已在本机验证 |
| VS Code 扩展 | 导入 Finding、生成唯一定位补丁、审阅、应用与导出 | 已通过逻辑测试；VS Code Engine `^1.90.0` |
| Cursor | 使用 VS Code Extension API | 预期兼容，尚未独立测试 |

## 五分钟拿到第一份证据

第一次成功不需要构建、不需要 API Key，也不需要模型账号。

```bash
git clone https://github.com/Jinchengawu/AI-Web-Performance-Plugin.git
cd AI-Web-Performance-Plugin
```

1. 打开 `chrome://extensions`。
2. 开启**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择仓库根目录。
4. 刷新准备评测的 `http://` 或 `https://` 页面。
5. 打开 PerfLens，点击**采集性能快照**。

页面应显示综合评分、当前可获得的 LCP/INP/CLS/TTFB、确定性规则覆盖率、内存证据、评测环境，并在本地历史中新增一条记录。AI 诊断是可选步骤。

### 第一次采集不完整时

- 浏览器内部页无法注入，请改用普通 `http(s)` 页面。
- 安装扩展后刷新目标页，让观察器从导航阶段开始运行。
- 页面发生符合条件的交互前，INP 会显示未采集。
- 扩展晚于相关导航启动时，LCP 可能不可用；刷新页面后重新采集。
- Renderer Memory 是可选能力，在不支持的 Chrome Channel 中不可用；此时仍可继续使用可获得的 JS Heap 与页面内存证据。

## 跑通浏览器到代码

### 1. 创建 Audit Package

采集后可以直接导出确定性报告。若要附加 AI 生成的 Optimization Plan，请选择 Provider，配置 Endpoint/模型，在需要时填入 API Key，然后点击**大模型诊断**。

点击**结构化 JSON**下载版本化 `perflens.audit-package`。Lighthouse/PageSpeed JSON、HTML、Markdown、CSV、TXT 与通用 JSON 可以作为额外的不可信证据导入；单文件上限 2 MB，最多八份附件。

### 2A. 使用 Codex Plugin 修复

以下命令已于 2026-08-14 在 Codex CLI `0.147.0-alpha.6.5` 中完成本地验证。Plugin CLI 语法可能随版本变化。

```bash
codex plugin marketplace add Jinchengawu/AI-Web-Performance-Plugin
codex plugin add perflens@perflens
```

安装后新建 Codex 任务，调用内置 Skill：

```text
Use $perflens-optimize to import /absolute/path/perflens-audit.json,
implement the safe P0/P1 fixes, run verification, and export a Fix Session.
```

该 Skill 把报告内容视为不可信证据，先把选中的 Finding 追溯到源码，再实施小范围修改；它会把静态验证与运行时结论分开，并记录剩余不确定性。Plugin 源码位于 [`plugins/perflens/`](./plugins/perflens/)。

### 2B. 使用 VS Code 修复

公开的 [`perflens-optimizer-0.1.0.vsix`](https://github.com/Jinchengawu/AI-Web-Performance-Plugin/releases/download/v0.3.0/perflens-optimizer-0.1.0.vsix) 属于 `v0.3.0` Release，其 SHA-256 为：

```text
3ba0e4e42379a4d7b6161aea443b48d02a192ad356cd590188376a4ff792a39a
```

若要使用当前仓库代码：

```bash
cd editor-extension
npx @vscode/vsce package
```

通过 **Extensions: Install from VSIX…** 安装，打开目标仓库后运行 **PerfLens: 导入结构化报告**。扩展将 Key 存入 VS Code SecretStorage，拒绝工作区外路径与非唯一源码匹配，并要求用户选择补丁、通过模态确认后才应用修改。模型建议的终端命令只展示，不会自动执行。

### 3. 复测并比较

从 Codex 或 VS Code 导出 Fix Session，然后回到 Chrome：

1. 通过**导入报告**同时选择基线 Audit Package 与 Fix Session。
2. 刷新修改后的页面，重复相关操作。
3. 再次点击**采集性能快照**。
4. 查看指标差异，以及已解决、新增和仍存在的 Finding ID。

## PerfLens 测什么

### 性能与运行时

- Core Web Vitals：LCP、高分位 INP、CLS Session Window
- Navigation：重定向、DNS、TCP、TLS、请求/TTFB、下载、FCP、DOMContentLoaded、Load
- 主线程：Long Task、估算 Total Blocking Time、Long Animation Frame、脚本归因
- 资源：瀑布、传输/解码体积、压缩、缓存信号、协议、最大/最慢资源、第三方 Origin
- 页面形态：DOM 数量与深度、图片、脚本、样式表、表单、链接、LCP 元素归因

### 内存与评测环境

- JS Heap 样本、峰值、增量、增长斜率、单调增长比例与观察时长
- 在安全、跨源隔离且浏览器支持时调用 `measureUserAgentSpecificMemory()`
- 通过 Chrome [`processes`](https://developer.chrome.com/docs/extensions/reference/api/processes) 权限读取可选 Renderer `privateMemory`；该 API 目前由官方标注为 Dev channel
- 浏览器/操作系统版本、CPU 数量、设备内存提示、Viewport、DPR、网络类型、Downlink、RTT、Save-Data、协议、时区与隔离状态

不同内存口径不能相互替代。高占用不等于泄漏。趋势分类至少需要 5 个可用样本并覆盖 30 秒，其结论只能缩小排查范围；最终定位仍需 DevTools Heap Snapshot 与对象保留路径。

### 确定性质量审计

PerfLens 实现了 43 条规则，覆盖性能、内存、SEO、可访问性、安全与工程质量。覆盖率区分已评估、通过、失败和不可用，避免把浏览器不支持的检查静默算作通过。

## 模型 Adapter

下表是截至 2026-08-14 的可配置源码默认值，并不保证每个 Provider 账号都已开放对应模型。仓库测试不会发起真实 Provider 请求。

| 预设 | 默认地址 | 默认模型 | 接口规范 |
|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-5.6-luna` | Responses API |
| DeepSeek | `https://api.deepseek.com` | `deepseek-v4-flash` | Chat Completions |
| Anthropic | `https://api.anthropic.com` | `claude-opus-4-8` | Messages API |
| OpenAI-compatible | 自定义 | 自定义 | Chat Completions |

所有 Adapter 都会把 Provider 输出规范化为同一种 Optimization Plan。账号可用性不同时，请修改模型或 Endpoint。只有配置的 OpenAI-compatible Endpoint 本身位于本机时，请求才会留在设备内。

## 协议与代码结构

`perflens.audit-package` 使用 Schema Major Version `1`。编辑器与 Codex Inspector 会拒绝格式错误和不受支持的 Major Version。Markdown 是便于阅读的 Adapter，JSON 才是跨产品端的事实来源。详见 [ADR-0001](./docs/adr/0001-portable-audit-package.md)。

```text
probes/                 Performance Observer、页面快照、内存与确定性规则
shared/                 报告协议、Evidence Intake、历史与基线比较
background.js           模型 Provider Adapter 与结构化诊断
popup.*                 Chrome UI Adapter
editor-extension/       VS Code 修复 Adapter
plugins/perflens/       Codex Plugin 与 perflens-optimize Skill
docs/adr/               架构决策
test/                   单元 Fixture 与真实浏览器集成测试
```

## 隐私、权限与数据流

Chrome 扩展声明 `activeTab`、`storage` 和 `scripting`，并在 `http(s)` 页面中注入，因此会请求这些页面的 Host Access。读取 Renderer 进程内存需要另一项可选权限。

| 产品端 | 本地保存 | 仅在用户操作后发送 | 导出与边界 |
|---|---|---|---|
| Chrome | Provider 配置和有上限的报告历史保存在 `chrome.storage.local`；为方便本地开发，API Key 也保存在其中 | AI 诊断会向配置的 Endpoint 发送脱敏 Snapshot、Audit、Coverage、最多 5 条历史摘要，以及总计不超过 16 万字符的最多 8 份附件正文 | 存储页面身份时移除 URL Query/Hash；Key 不导出。历史每页 20 条、全局 120 条，接近 7 MB 时淘汰 |
| VS Code | API Key 存入 SecretStorage；设置和待应用状态位于 Extension Host | 生成补丁时发送 Plan、`package.json` 与排序后的源码上下文，默认最多 12 个文件/16 万字符 | Fix Session 记录路径、原因、Finding ID、验证与哈希，不含 Key 或源码正文 |
| Codex | 在当前 Codex 环境内读取所选报告与工作区；Plugin 自身没有独立 API Key 或 MCP Server | 源码如何处理取决于当前 Codex Host、账号与模型策略 | Fix Session 记录路径、原因、Finding ID、哈希与验证；本地报告不代表全程离线 |

导入报告、页面文本、资源名和源码都是不可信数据，而不是指令。公开或组织级分发前，应增加后端 Token Broker、短期凭证、限流、用户同意、数据保留和成本审计。请阅读 [`SECURITY.md`](./SECURITY.md)。

## 兼容性

| 产品端 / 输入 | 状态 | 范围 |
|---|---|---|
| Chrome MV3 | ✅ 真实浏览器测试 | `http(s)` 页面；不包含浏览器内部页 |
| Codex Plugin | ✅ 本地验证 | CLI `0.147.0-alpha.6.5`；Manifest、Skill 与包测试 |
| VS Code | ✅ 逻辑测试 | Engine `^1.90.0`；尚无 Extension Host E2E |
| Cursor | ◐ 兼容性推断 | 使用 VS Code API；尚未独立测试 |
| Lighthouse/PageSpeed JSON | ✅ Fixture 测试 | 作为 External Evidence 规范化导入 |
| HTML/Markdown/CSV/TXT/通用 JSON | ✅ 实现测试 | 单文件 2 MB；最多八份附件 |

## 开发与验证

CI 使用 Node `22`。2026-08-14 的审计环境为 Node `22.17.1`、npm `10.9.2`、Python `3.9.6` 与 Playwright `1.58.2`。

```bash
npm ci
npx playwright install chromium

# 语法、协议、模型 Adapter、历史、内存、编辑器与 Plugin 测试
npm test

# 加载真实 MV3 扩展并运行浏览器工作流
npm run test:browser
```

浏览器测试使用隔离的 Chromium Profile 和本地 Fixture。Provider 测试使用模拟响应，不能证明账号可用性或真实 API 行为。

## 当前限制

- Chrome 界面目前仅提供中文。
- 真实会话快照不等同于带 CPU/网络节流的 Lighthouse 实验室测试。
- 单一设备结果不能证明现场用户性能或用户影响。
- INP 需要交互；缺少 `Timing-Allow-Origin` 时，跨域资源可能隐藏时序与体积。
- 页面整体内存估算要求浏览器支持以及安全、跨源隔离的文档。
- Renderer private memory 依赖可选的 Dev-channel `processes` API，也可能包含共享 Renderer 工作。
- 内存分类只提示风险，不能定位保留对象，也不能证明泄漏。
- 编辑器修复使用唯一文本替换，尚未实现 AST/Codemod。
- Cursor 兼容性与真实模型 Provider 调用尚未独立验证。
- 在可比工作负载下完成浏览器复测前，不应推断任何性能改善。

## 计划中，不是当前功能

- AST/Codemod 修复 Adapter
- 编辑器工作流自动关联基线与复测报告

## 贡献

欢迎 Issue 和 Pull Request。修改采集、协议字段、Provider Adapter 或修复行为前，请阅读 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。提交内容应说明用户影响与验证证据，为行为变化增加测试，并在修改采集或导出时补充浏览器覆盖。不要提交真实 API Key、私有报告、源码上下文或客户数据。

## 许可证

[MIT](./LICENSE) © [Jinchengawu](https://github.com/Jinchengawu) 与 PerfLens Contributors。
