# KodaX Space Partner 文档中心

Partner 是 KodaX Space 中面向知识工作的产品 Surface。它与 Coder 共享 Space/KodaX 底座，但拥有自己的工作区、专家、连接器、成果和安全授权语义。

本目录是 Partner 产品线的文档中心，由 Partner 负责人主要维护。Partner 不是独立 Runtime，也不是脱离 Space 的第二个应用；独立的是产品线文档、功能管理和实现责任边界。

## 文档权威边界

| 问题                              | 权威来源                                                                   |
| --------------------------------- | -------------------------------------------------------------------------- |
| Space 整体产品定位与正式发布范围  | [Space PRD](../PRD.md)、[Space Feature List](../FEATURE_LIST.md)           |
| Space/Coder/Partner 共享架构      | [Space HLD](../HLD.md)、[ADR-007](../ADR/ADR-007-partner-surface-model.md) |
| Partner 详细产品定义              | [Partner PRD](PRD.md)                                                      |
| Partner 内部架构                  | [Partner HLD](HLD.md)                                                      |
| Partner 与 Space/Coder 的融合关系 | [Integration](INTEGRATION.md)                                              |
| Partner 内部 Feature 与开发状态   | [Partner Feature List](FEATURE_LIST.md)                                    |
| Partner 开发、Git、测试和上游同步 | [Development](DEVELOPMENT.md)                                              |

边界规则：

- `docs/partner/**` 负责 Partner 内部事实，不复制 Space 总文档的完整内容。
- `docs/FEATURE_LIST.md` 是 Space 正式发布状态的权威来源；`docs/partner/FEATURE_LIST.md` 只管理 `PF###`。
- Partner 的 `Completed` 不等于已经进入 Space；只有具有主线证据的 `Integrated` 才表示完成融合。
- 共享 Runtime、IPC、安全宿主或 Coder 行为发生变化时，需要共同评审并更新 Space 级契约。
- 若文档发生矛盾，共享架构和 Space 发布事实以全局文档为准；Partner 内部产品和实现细节以本目录为准。

## Partner 产品线

Partner 当前包含三条相互配合的主线：

1. **Partner 工作面**：知识工作对话、任务上下文、资料、协作、成果与平台原生交付。
2. **插件库**：专家与连接器的发现、选择、配置和会话绑定。
3. **Space 融合**：复用 Space Runtime、Electron 可信宿主、权限、IPC、Skill、Artifact 和共享 Shell，同时保持 Coder 行为稳定。

## 当前主 Feature

- Partner Feature：`PF001 — Partner Plugin Library Extension`
- Space 映射：`F146`
- Partner 状态：[Partner Feature List](FEATURE_LIST.md)
- Space 状态：[Space Feature List](../FEATURE_LIST.md)
- Partner 版本设计：[PF001 / v0.1.61-p.1](features/v0.1.61-p.1.md#feature-pf001)
- 详细开发计划：[F146 Partner 插件库开发计划](features/v0.1.61-partner-plugin-library.md)
- 人工验收：[F146 测试指南](test-guides/FEATURE_146_v0.1.61_TEST_GUIDE.md)

`PF001` 管理 Partner 分支内的实现与验收，`F146` 管理该能力是否进入 Space。P1–P9 是 PF001 的实施阶段，不是九个独立 Feature。

## 文档导航

### 产品与架构

- [PRD](PRD.md)：Partner 的用户、场景、产品模型、目标和边界。
- [HLD](HLD.md)：Partner 内部模块、数据流、会话、专家、连接器和可信宿主适配。
- [Integration](INTEGRATION.md)：Partner 与 Space/Coder 的共享接缝、映射和融合证据。
- [Development](DEVELOPMENT.md)：本地 Git、代码地图、同步上游、测试和发布门槛。

### Feature、验收与发布

- [Feature List](FEATURE_LIST.md)：PF 功能台账及开发/集成双状态。
- [Feature Archive](FEATURES_ARCHIVED.md)：满足归档条件的 Partner Feature 历史。
- [`features/`](features/)：Partner 功能设计、评审和实现证据。
- [`test-guides/`](test-guides/)：Partner 人工验收指导。
- [`releases/`](releases/)：Partner 独立版本记录；Space 正式发布继续记录在全局发布目录。
- [`ADR/`](ADR/)：Partner 内部决策；影响 Space/Coder 的决策继续写入全局 ADR。

### PF001 / F146 现有材料

- [开发计划](features/v0.1.61-partner-plugin-library.md)
- [P1–P3 评审](features/F146-plugin-library-review.md)
- [P4/P5 飞书切片](features/f146-p4-p5-feishu.md)
- [P4/P5 评审](features/F146-p4-p5-review.md)
- [飞书首次连接](features/f146-feishu-onboarding.md)
- [多连接器路线](features/f146-multi-connectors.md)
- [多连接器评审](features/F146-multi-connectors-review.md)
- [官方办公连接器](features/f146-official-office-connectors.md)
- [企业微信证据](features/f146-wecom-evidence.md)
- [钉钉证据](features/f146-dingtalk-evidence.md)
- [腾讯会议证据](features/f146-tmeet-evidence.md)

## 代码导航

Partner 代码不会移动到文档目录；源码继续按 Electron、Renderer、Extension 和共享协议的运行职责组织：

- [Partner UI](../../apps/desktop/renderer/src/features/partner/)
- [插件与连接器 UI](../../apps/desktop/renderer/src/features/extensions/)
- [可信连接器宿主](../../apps/desktop/electron/partner-connectors/)
- [Space Extension 宿主](../../apps/desktop/electron/space-extensions/)
- [Partner 插件包](../../extensions/partner-library/)
- [插件包说明](../../extensions/partner-library/README.md)
- [共享 IPC Schema](../../packages/space-ipc-schema/)

代码的主要维护者与共同评审边界见 [Development](DEVELOPMENT.md) 和 [Integration](INTEGRATION.md)。

## Space 历史与共享来源

以下文件属于 Space 的历史或共享产品事实。本目录引用它们，但不搬移、不删除：

- [Space PRD：Partner 全场景](../PRD.md#23-partner-全场景--全功能)
- [Space HLD：Surface 抽象](../HLD.md#94-surface-抽象)
- [ADR-007：Partner Surface Model](../ADR/ADR-007-partner-surface-model.md)
- [v0.1.30 Partner Re-enable Foundation](../features/v0.1.30.md)
- [F122–F124 Partner Knowledge 实施计划](../features/v0.1.32-partner-knowledge-implementation-plan.md)
- [F130 Partner Workspace](../features/v0.1.64.md)

## 维护约定

- 新增、开始、完成或归档 Partner 功能时使用 `partner-feature-manager`。
- PF 设计写入 `docs/partner/features/`，不要写回 Space 的 `docs/features/`。
- Partner 测试、评审和发布证据写入本目录对应子目录。
- 准备进入 Space 时，在 [Integration](INTEGRATION.md) 记录目标分支、提交、Space Feature 和验证证据。
- 只有影响 Space 总产品、共享架构或正式发布时，才小范围修改全局文档。
