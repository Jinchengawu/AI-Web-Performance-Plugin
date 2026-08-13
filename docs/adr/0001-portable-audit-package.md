# ADR-0001: Use a portable audit package as the browser-to-editor contract

- Status: Accepted
- Date: 2026-08-14

## Context

自由 Markdown 报告适合阅读，但不能可靠驱动编辑器定位文件、应用修复和执行验收。浏览器采集、外部报告和模型输出也需要保留来源。

## Decision

使用带 `schemaVersion` 的 Portable Audit Package 作为跨产品 Interface。包内保存原始快照、确定性审计、外部证据、结构化 Optimization Plan 和生成元数据。Markdown 是该包的展示 Adapter，不是事实来源。

## Consequences

- 编辑器端拒绝不支持的 schema major version。
- 后续字段变更需要迁移策略。
- 所有模型 Adapter 必须产出同一种 Optimization Plan。
- 敏感 URL 查询参数和过大的外部材料不得进入可移植包。
