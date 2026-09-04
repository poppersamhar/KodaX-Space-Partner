# Partner Feature List

## Authority

本文件是 Partner 产品线内部 Feature、开发状态和 Space 集成状态的权威来源。

- Space 正式 Feature、目标版本和发布状态以 [`docs/FEATURE_LIST.md`](../FEATURE_LIST.md) 为准。
- Partner 的 `Completed` 只表示本地产品线实现与验收完成，不等于已经进入 Space。
- 只有目标提交已进入 Space 主线并具有可核验证据时，才能标记 `Integrated`。
- Partner Feature 使用 `PF###`；Space Feature 使用 `F###`。新 Space ID 只能由全局 Feature 流程分配。

## Version Info

- Current Partner Release: Unreleased
- Planned Partner Version: `v0.1.61-p.1` host / Partner library `0.9.1`
- Space Baseline: KodaX Space `v0.1.46-alpha.3` / KodaX `0.7.96-alpha.7`
- Active Branch: `feature/f146-partner-plugin-library`
- Latest Upstream Observed: `upstream/main@7528383`（尚未进入当前 Partner 分支）
- Last Updated: 2026-09-04

## Feature Index

| ID    | Title                            | Category | Priority | Partner Target                  | Dev Status | Integration | Space Feature | Design                                                |
| ----- | -------------------------------- | -------- | -------- | ------------------------------- | ---------- | ----------- | ------------- | ----------------------------------------------------- |
| PF001 | Partner Plugin Library Extension | New      | High     | `v0.1.61-p.1` / library `0.9.1` | InProgress | Local       | F146          | [PF001 design](features/v0.1.61-p.1.md#feature-pf001) |

## Feature Details

<a id="pf001--partner-plugin-library-extension"></a>

### PF001 — Partner Plugin Library Extension

- Description: 在 Space 的 Partner surface 上提供可独立安装的插件库、持久化专家、会话级连接器、可信宿主远端操作和统一任务详情工作区，同时保持 Coder 与共享 KodaX Runtime 行为不变。
- Category: New
- Priority: High
- Partner Target: `v0.1.61-p.1` host / Partner library `0.9.1`
- Dev Status: InProgress
- Integration Status: Local
- Space Feature: F146
- Design: [PF001 version design](features/v0.1.61-p.1.md#feature-pf001)
- Created: 2026-08-31
- Updated: 2026-09-04
- Evidence: [详细开发计划](features/v0.1.61-partner-plugin-library.md)、[P1–P3 评审](features/F146-plugin-library-review.md)、[P4/P5 评审](features/F146-p4-p5-review.md)、[多连接器评审](features/F146-multi-connectors-review.md)、[人工测试指南](test-guides/FEATURE_146_v0.1.61_TEST_GUIDE.md)

PF001 承接现有 Space F146。P1–P9 是 PF001 内部实施阶段，不单独占用 PF 编号。F096、F122–F124、F130 等 Space 既有能力是继承基线或依赖，不复制为新的 Partner Feature。

## Summary

- Total: 1
- Planned: 0
- InProgress: 1
- Completed: 0
- Local: 1
- Ready: 0
- Proposed: 0
- Integrated: 0
- Next PF ID: PF002
