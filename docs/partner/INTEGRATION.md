# Partner 与 Space/Coder 集成契约

## 1. 文档职责与权威来源

本文记录 Partner 与 Space/Coder 的共享接缝、Feature 映射、上游差异和集成证据。

- Partner 开发与集成状态：[Partner Feature List](FEATURE_LIST.md)
- Space 正式功能状态：[Space Feature List](../FEATURE_LIST.md)
- Space 共享架构：[Space HLD](../HLD.md)
- Partner 内部架构：[Partner HLD](HLD.md)
- 上游同步和验证流程：[Development](DEVELOPMENT.md)

本文不复制完整产品需求，也不以本地 `Completed` 冒充 Space `Integrated`。

## 2. 产品线所有权

| 范围                                                | 主要维护   | 评审规则                                    |
| --------------------------------------------------- | ---------- | ------------------------------------------- |
| `docs/partner/**`、Partner 插件包与专属 UI          | Partner    | 影响共享契约时增加 Space 评审               |
| Connector host 与 Partner Runtime adapter           | Partner    | 安全、凭据、远端写入和 Session 接缝共同评审 |
| IPC schema、Space Extension host、Shell/Main/Window | Space 共享 | Partner 与 Coder 双向回归                   |
| Space 总 PRD/HLD/Feature List/发布记录              | Space 共享 | 只有融合被接受后更新                        |

## 3. Shared Seams

| 接缝                       | 主要位置                                           | 不变量                            |
| -------------------------- | -------------------------------------------------- | --------------------------------- |
| Surface Runtime owner      | `host.ts`、`session-adapter.ts`、`real-session.ts` | Partner 不改变 Coder daemon owner |
| Session 与 Expert snapshot | session schema、runtime store                      | 恢复、切换和 fork 保持精确版本    |
| IPC/preload                | IPC schema、handler、preload allowlist             | 先定义 typed contract，再接 UI    |
| Extension Host             | `space-extensions/**`                              | 通用能力需要共同评审              |
| Connector Host             | `partner-connectors/**`                            | Partner 主维护，主进程作最终授权  |
| Shell/布局                 | `Shell.tsx`、`BottomBar.tsx`、`LeftSidebar.tsx`    | `code` surface 行为保持不变       |
| Browser 安全               | CSP、navigation guard、frame policy                | 平台接入不得放宽全局策略          |
| Build/Packaging            | manifests、scripts、builder config                 | 主应用和独立 Extension 都要验证   |

## 4. Coder 非回归约束

- `surface === 'code'` 的工具、布局、会话、daemon 和快捷入口保持原行为。
- Partner channel/tool 不暴露给 Coder，Coder 不依赖 Partner 插件是否安装。
- Partner Extension 不通过修改 Coder 业务逻辑获得权限。
- Partner Extension 缺失、禁用或不兼容时，Space 和 Coder 仍能启动。
- 共享文件即使自动合并，也必须执行 Coder 回归；文本无冲突不等于行为兼容。

## 5. Partner → Space Feature 映射

```text
Partner 开发：Planned -> InProgress -> Completed
Partner 融合：Local -> Ready -> Proposed -> Integrated
```

| Partner Feature | Space Feature | Target        | Development | Integration | Evidence                                              | Updated    |
| --------------- | ------------- | ------------- | ----------- | ----------- | ----------------------------------------------------- | ---------- |
| PF001           | F146          | `v0.1.61-p.1` | InProgress  | Local       | [PF001 design](features/v0.1.61-p.1.md#feature-pf001) | 2026-09-04 |

规则：

- 不在本表复制 PF 的完整描述。
- 没有现存 F-ID 时不得猜测或抢占编号。
- 进入 `Ready`、`Proposed`、`Integrated` 时记录目标分支、PR/提交和验证证据。
- 一个 Space F-ID 可以承接多个 PF；映射不改变两边各自的状态权威。

## 6. 当前集成快照

| 项目                  | 当前证据                                                        |
| --------------------- | --------------------------------------------------------------- |
| Partner branch        | `feature/f146-partner-plugin-library@60021b6`（本次文档迁移前） |
| 已合入 Space baseline | `aba7359` 合并 `v0.1.46-alpha.3@1a310ae`                        |
| 最新观察到的 upstream | `upstream/main@7528383`，当前 Partner 分支尚未包含              |
| Partner Feature       | PF001 / F146，`InProgress / Local`                              |
| Partner library       | `extensions/partner-library/manifest.json` 的 `0.9.1`           |

该表是带日期的集成快照，不替代 Git。每次同步后应更新提交证据和验证结果。

## 7. 待协调的上游差异

- Space F130 与 PF001/P9 对 Partner 右侧工作区、Results/Process/Files 和 Terminal 的产品描述需要在集成时统一。
- Space F096 仍管理通用 Connector foundation；PF001 的有限连接器和风险路由不能自动把 F096 标记完成。
- Experts 与独立 Partner 插件库属于 F146 fork 增量，在上游接受前只在 Partner 文档中作为当前实现事实。
- Space 总文档中的正式版本与已交付声明不得被 fork-only `v0.1.61-p.1` 覆盖。

## 8. 上游同步与合并门槛

1. 从干净的 F146 创建 `integration/partner-upstream-YYYYMMDD`。
2. 合入最新 `upstream/main`，解决共享代码和文档冲突。
3. 验证 Partner Extension、Partner/Coder desktop、IPC、类型、lint 和打包。
4. 记录真实服务人工项与自动 fixture 的差异。
5. 验证通过后再合回 F146；准备进入 Space 时使用明确 PR/目标分支。
6. 只有目标提交进入 Space 主线后才将 PF 标记 `Integrated`。

详细命令见 [Development](DEVELOPMENT.md)。

## 9. 兼容性来源

不要在多份文档手抄易漂移版本，检查以下权威文件：

| 项目                    | 权威来源                                        |
| ----------------------- | ----------------------------------------------- |
| Space version           | `package.json`                                  |
| Desktop version         | `apps/desktop/package.json`                     |
| KodaX version/integrity | `package-lock.json`                             |
| Partner Library version | `extensions/partner-library/manifest.json`      |
| Host API                | Partner manifest + IPC schema                   |
| Host capabilities       | Partner manifest + Electron host implementation |

## 10. 回滚与总文档更新

- 优先关闭单个 Extension action 或 connector，不回滚整个 Space Runtime。
- 保留历史记录不表示旧动作仍可执行；授权撤销和安全策略始终优先。
- Partner 详细文档只在 `docs/partner/**` 维护。
- Space README/PRD/HLD 只保留 Partner 定位和共享契约；接受融合后才更新相关句子与链接。
- Space `FEATURE_LIST.md` 保留 F146 的总体状态和 Partner PF 链接，不复制 P1–P9 细节。
