# Partner Feature List

## Authority

本文件是 Partner 产品线内部 Feature、开发状态和 Space 集成状态的权威来源。

- Space 正式 Feature、目标版本和发布状态以 [`docs/FEATURE_LIST.md`](../FEATURE_LIST.md) 为准。
- Partner 的 `Completed` 只表示本地产品线实现与验收完成，不等于已经进入 Space。
- 只有目标提交已进入 Space 主线并具有可核验证据时，才能标记 `Integrated`。
- Partner Feature 使用 `PF###`；Space Feature 使用 `F###`。新 Space ID 只能由全局 Feature 流程分配。

## Version Info

- Current Partner Release: Unreleased
- Planned Partner Version: `v0.1.0`
- Partner Library Target: `0.1.0`
- Space Baseline: KodaX Space `v0.1.46-alpha.5` / KodaX `0.7.96-beta.1`（来源：`package-lock.json`）
- Active Branch: `integration/partner-upstream-20260904-v0.1.0`
- Current Git Snapshot: `ea7d61c`（本次文档重整前）
- Last Updated: 2026-09-04

## Feature Index

| ID    | Title                                                | Category    | Priority | Partner Target | Dev Status | Integration | Space Feature | Design                                           |
| ----- | ---------------------------------------------------- | ----------- | -------- | -------------- | ---------- | ----------- | ------------- | ------------------------------------------------ |
| PF001 | Partner Extension & Expert Library                   | New         | High     | `v0.1.0`       | InProgress | Local       | F146          | [PF001 design](features/v0.1.0.md#feature-pf001) |
| PF002 | Governed Connector Previews & Feishu Platform Expert | New         | High     | `v0.1.0`       | InProgress | Local       | F146          | [PF002 design](features/v0.1.0.md#feature-pf002) |
| PF003 | Receipt-First Delivery & Unified Workspace           | Enhancement | High     | `v0.1.0`       | InProgress | Local       | F146          | [PF003 design](features/v0.1.0.md#feature-pf003) |

## Feature Details

<a id="pf001--partner-plugin-library-extension"></a>

### PF001 — Partner Extension & Expert Library

- Description: 交付可独立安装和停用的 Partner Extension，以及预置与用户专家、可选 Skill、会话绑定和不可变专家快照；对应既有 P1–P3。
- Category: New
- Priority: High
- Partner Target: `v0.1.0`
- Dev Status: InProgress
- Integration Status: Local
- Space Feature: F146
- Design: [PF001 version design](features/v0.1.0.md#feature-pf001)
- Created: 2026-08-31
- Updated: 2026-09-04
- Evidence: [P1–P3 实施记录](features/v0.1.61-partner-plugin-library.md)、[P1–P3 评审](features/F146-plugin-library-review.md)、[人工测试指南 TC-001–TC-009](test-guides/FEATURE_146_v0.1.61_TEST_GUIDE.md)

### PF002 — Governed Connector Previews & Feishu Platform Expert

- Description: 交付受可信宿主管理的连接器预览、账号与会话范围、读取和受审写入，并以飞书办公套件专家及受控 Base 创建形成首个平台切片；对应既有 P4–P7。
- Category: New
- Priority: High
- Partner Target: `v0.1.0`
- Dev Status: InProgress
- Integration Status: Local
- Space Feature: F146
- Design: [PF002 version design](features/v0.1.0.md#feature-pf002)
- Created: 2026-09-04
- Updated: 2026-09-04
- Evidence: [P4–P7 实施记录](features/v0.1.61-partner-plugin-library.md)、[飞书契约](features/f146-p4-p5-feishu.md)、[P4/P5 评审](features/F146-p4-p5-review.md)、[首次连接记录](features/f146-feishu-onboarding.md)、[多连接器设计](features/f146-multi-connectors.md)、[多连接器评审](features/F146-multi-connectors-review.md)、[人工测试指南 TC-010–TC-038](test-guides/FEATURE_146_v0.1.61_TEST_GUIDE.md)

### PF003 — Receipt-First Delivery & Unified Workspace

- Description: 以可信创建回执优先交付平台原生资源，把资源创建状态与内容校验状态分开，并将网页、文件、Artifact、Skill 和专家汇入统一详情工作区；对应既有 P8–P9。
- Category: Enhancement
- Priority: High
- Partner Target: `v0.1.0`
- Dev Status: InProgress
- Integration Status: Local
- Space Feature: F146
- Design: [PF003 version design](features/v0.1.0.md#feature-pf003)
- Created: 2026-09-04
- Updated: 2026-09-04
- Evidence: [P8–P9 实施与自动验证记录](features/v0.1.61-partner-plugin-library.md)、[P8 人工测试素材 TC-039–TC-045](test-guides/FEATURE_146_v0.1.61_TEST_GUIDE.md)

`F146 <- PF001, PF002, PF003`。三个 PF 分别维护 Partner 内部验收边界，但共同承接一个 Space 可交付 Feature；F096、F122–F124、F130 等仍是 Space 既有基线或依赖，不在 Partner 台账重复登记。

## Summary

- Total: 3
- Planned: 0
- InProgress: 3
- Completed: 0
- Local: 3
- Ready: 0
- Proposed: 0
- Integrated: 0
- Next PF ID: PF004
