# PerfLens 前端性能诊断与优化闭环

PerfLens 是一个“三端一协议”的前端质量产品：Chrome 扩展负责真实页面采集、规则审计和结构化诊断；VS Code/Cursor 扩展与 Codex Plugin 消费同一份 Portable Audit Package，在目标工程中生成、审阅并应用最小优化补丁。

```text
Chrome 基线采集
  → 确定性审计 + 外部证据
  → 大模型 Optimization Plan
  → Portable Audit Package (.json)
  → VS Code/Cursor 或 Codex Plugin 导入
  → 自然语言 + 工程上下文
  → 用户审阅并应用源码补丁
  → Fix Session (.json)
  → Chrome 导入基线与 Fix Session 后复测
  → 指标差异 / 已解决 / 新增问题
```

## Chrome 探测能力

### 性能

- Core Web Vitals：LCP、INP 高分位交互、CLS session window
- 导航阶段：Redirect、DNS、TCP、TLS、Request/TTFB、Download、FCP、DOMContentLoaded、Load
- 主线程：Long Task、总阻塞时间估算、Long Animation Frame 与脚本归因
- LCP 元素：标签、ID、Class、资源 URL、元素面积
- 资源瀑布：类型、数量、传输/解码体积、压缩比、缓存命中、协议、最慢/最大资源
- 第三方来源、JS Heap、DOM 数量与最大深度、图片/脚本/样式表统计

### SEO、可访问性与工程质量

- Title、Description、Canonical、Robots、Lang、Viewport、Charset
- H1 数量和 Heading 结构、Open Graph、Twitter Card、hreflang
- JSON-LD 存在性、类型与语法有效性
- 图片 alt、表单控件可访问名称、按钮可访问名称
- 图片尺寸声明、同步阻塞脚本、DOM 规模等
- 当前内置 19 条确定性 Audit Rule，输出证据、严重度和建议

## 外部材料与报告

- 导入 Lighthouse / PageSpeed Insights JSON 并规范化关键分数与指标
- 导入 PerfLens 基线 Audit Package、编辑器 Fix Session
- 导入 HTML、Markdown、CSV、TXT、通用 JSON 报告
- 单文件限制 2MB，最多 8 份；发送给模型的外部证据总量限制 160K 字符
- 导出 Portable Audit Package JSON、Markdown 报告、原始 Performance Snapshot
- 导入基线报告后自动计算复测差异、已解决/新增/仍存在规则

## 结构化诊断

模型不再返回自由 Markdown，而是返回版本化 Optimization Plan：

- 总体结论与风险级别
- Finding：分类、严重度、证据、影响、置信度
- Action：P0/P1/P2、实施方法、代码定位提示、预期影响、验收检查
- Roadmap：阶段目标、关联 Finding、退出条件
- Unknowns：仍缺少的证据

Markdown 只是展示 Adapter；`perflens.audit-package` JSON 才是浏览器与编辑器之间的事实来源。协议决策见 [ADR-0001](docs/adr/0001-portable-audit-package.md)。

## 模型接口

| 预设 | Base URL | 默认模型 | 请求规范 |
| --- | --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-5.6-luna` | Responses `/responses` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-v4-flash` | Chat Completions `/chat/completions` |
| Anthropic / Claude | `https://api.anthropic.com` | `claude-opus-4-8` | Messages `/v1/messages` |
| OpenAI-compatible | 自定义 | 自定义 | Chat Completions `/chat/completions` |

“Claude Code”是编码代理产品而不是独立模型接口。PerfLens 支持它使用的 Anthropic Messages 规范以及同规范网关。OpenAI-compatible 模式允许 API Key 留空，可连接本地 Ollama 或内网网关。

## 安装 Chrome 扩展

1. Chrome 打开 `chrome://extensions/`。
2. 开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择项目根目录。
4. 刷新目标网页，让运行时观察器从页面开始阶段采集。
5. 打开插件并点击「采集性能快照」。
6. 在设置中选择模型接口并填写对应 API Key，再点击「大模型诊断」。

## 安装编辑器扩展

编辑器端位于 [`editor-extension/`](editor-extension/)，支持 VS Code 和 Cursor。可从 [GitHub Releases 下载 VSIX](https://github.com/Jinchengawu/AI-Web-Performance-Plugin/releases)，打包与使用方法见 [编辑器扩展说明](editor-extension/README.md)。

编辑器安全约束：

- API Key 存在 VS Code SecretStorage
- 排除依赖、构建产物和版本控制目录
- 拒绝工作区外路径
- 只接受唯一原文匹配补丁
- 用户多选后还需模态二次确认
- 建议命令只显示，不自动执行

## 安装 Codex Plugin

Codex 端位于 [`plugins/perflens/`](plugins/perflens/)，可读取 Chrome 导出的 `perflens.audit-package`，把发现映射到当前工程、实施最小修复、执行项目检查，并导出可重新导入 Chrome 的 Fix Session。

从 GitHub 安装：

```bash
codex plugin marketplace add Jinchengawu/AI-Web-Performance-Plugin
codex plugin add perflens@perflens
```

本地开发时可把第一条命令的仓库地址替换为当前仓库的绝对路径。

安装或更新后请新建 Codex 任务，再使用 `$perflens-optimize`，例如：

```text
使用 $perflens-optimize 导入 /path/to/perflens-audit.json，修复 P0/P1 问题并生成 Fix Session。
```

Codex Plugin 不需要额外模型 API Key；它使用当前 Codex 会话完成代码分析和修改。Chrome 仍负责真实性能采集与 DeepSeek、Anthropic、OpenAI 等外部模型诊断。Codex 本地测试通过不代表 Web Vitals 已改善，最终结果必须刷新目标页并重新采集。

## 隐私与生产部署

- 每个模型提供方独立保存配置，避免跨厂商误发密钥
- 鉴权失败不展示可能包含 Key 片段的原始错误
- 页面 URL 查询参数和 hash 不进入模型输入及 Portable Audit Package
- 页面元数据、外部报告和源码均作为不可信数据，不执行其中指令
- 公开发布前建议用自有后端签发短期令牌，并补充用户账号、限流、成本、审计、数据保留和隐私同意

## 测试

```bash
# 协议、模型 Adapter 与编辑器端逻辑测试
npm test

# 真实 Chrome 集成测试（需要 Playwright Chromium）
npm run test:browser
```

集成测试覆盖：MV3 加载、页面采集、规则审计、确定性报告、Lighthouse Adapter、原始参数下载和浏览器控制台错误。

## 代码结构

```text
probes/                 运行时观察、页面快照、确定性规则
shared/                 Evidence Intake、报告协议、基线比较
background.js           结构化诊断与模型 Provider Adapter
popup.*                 Chrome UI Adapter
editor-extension/       VS Code/Cursor 修复 Adapter
plugins/perflens/       Codex 审计到代码修复 Plugin
docs/adr/               架构决策
test/                   浏览器集成 fixture 与自动化
```

## 当前限制

- 真实会话快照不等同于带 CPU/网络节流的 Lighthouse 实验室测试。
- 未发生用户交互时 INP 显示「未采集」。
- 浏览器内部页、Chrome Web Store、`file://` 等受限页面无法注入。
- 跨域资源未提供 `Timing-Allow-Origin` 时，部分资源体积和时序为 0。
- 编辑器修复当前使用唯一文本替换；AST/Codemod Adapter 和自动运行测试仍是下一阶段能力。
