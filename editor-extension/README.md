# PerfLens Optimizer（VS Code / Cursor）

编辑器端修复 Adapter，消费 Chrome 插件导出的 `perflens.audit-package` JSON。

## 本地安装

可以直接从项目 [GitHub Releases](https://github.com/Jinchengawu/AI-Web-Performance-Plugin/releases) 下载 VSIX。若需从源码构建：

1. 安装 VS Code 扩展打包器：`npm install -g @vscode/vsce`。
2. 在本目录运行 `vsce package`。
3. VS Code / Cursor 执行“Extensions: Install from VSIX...”，选择生成的 `.vsix`。
4. 打开目标前端工程，运行“PerfLens: 导入结构化报告”。
5. 在设置中配置提供方、Base URL、模型；运行“PerfLens: 设置当前模型 API Key”。
6. 点击侧边栏问题或运行“PerfLens: 对话并生成优化补丁”。

## 安全模型

- API Key 使用 VS Code SecretStorage，不写入设置、报告或工程。
- 仅读取常见前端源码；排除依赖、构建产物和版本控制目录。
- 模型只能提出“唯一原文 → 替换文本”补丁。
- 工作区外路径、缺失原文、重复原文均被拒绝。
- 用户先多选补丁，再通过模态确认后才应用。
- 模型建议的终端命令只显示，不自动执行。

## 当前闭环

`Chrome 基线采集 → 结构化诊断 → 导出 Audit Package → 编辑器导入 → 对话生成补丁 → 用户审阅应用 → 导出 Fix Session → Chrome 复测`

下一版将把基线报告与复测报告自动关联，直接计算指标和 Audit Finding 差异。
