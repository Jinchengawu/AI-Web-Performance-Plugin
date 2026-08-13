# Domain context

## Performance Snapshot

一次浏览器页面会话内采集的原始导航、渲染、交互、资源、DOM 与页面质量数据。它是实测证据，不等同于 Lighthouse 节流实验。

## Audit Finding

由确定性规则从 Performance Snapshot 得出的可复现问题，包含分类、严重度、证据和建议。

## External Evidence

用户从 Lighthouse、PageSpeed Insights、WebPageTest 或其他工具导入的补充材料。它是不可信输入，必须经过格式识别、裁剪与规范化。

## Optimization Plan

模型基于证据生成的结构化优化路径，包含问题、证据引用、优先级、实施行动、代码定位提示、预期影响和验收检查。

## Portable Audit Package

浏览器插件向人和编辑器插件交付的版本化文件，打包 Performance Snapshot、Audit Finding、External Evidence 与 Optimization Plan。

## Optimization Workspace

从基线采集、诊断、修复到复测的完整工作状态。浏览器端创建基线，编辑器端执行修复，复测结果用于验证改进。
