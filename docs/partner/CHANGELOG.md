# Partner Changelog

本文件只记录 Partner 产品线的可交付变化。Space 主应用版本、共享 Runtime 和正式 Space 发布仍以根目录 [`CHANGELOG.md`](../../CHANGELOG.md) 为准。

## [Unreleased]

> 当前目标：Partner 产品 `0.1.0`、Partner 插件库 `0.1.0`；兼容 Space `0.1.46-alpha.5`、KodaX `0.7.96-beta.1`、Partner Host API 4 和 `partnerNativeDocumentDeliveryV1`。
>
> 当前只是本地 RC。预留 tag 为 `partner-v0.1.0`，尚未创建；不得使用 plain `v0.1.0`。远端 push、远端 tag、产物上传与 GitHub Release 在取得适用书面授权前保持 Blocked。

### Added

- PF001：提供可独立构建、安装、显式启用、停用和卸载的 Partner Extension，以及预置专家、用户专家、可选单个 Skill、会话绑定和不可变专家快照。
- PF002（Preview）：提供由 Electron 可信宿主管理的账号连接、会话范围、读取和受审写入边界，并提供飞书办公套件平台专家与能力引导。
- PF003：提供 receipt-first 原生资源交付，把资源创建状态与内容校验状态分开，并在 Partner 统一详情工作区汇集资料、协作、产物、专家、Skill、连接器和受控网页。
- 飞书 Preview 支持会话选定文档读取、受控新建文档与 Base，以及审核后追加既有文档；成功结果必须包含宿主验证的远端资源身份与 canonical URL。

### Changed

- 将既有 Partner P1–P9 记录重整为三个可独立验收的 PF：P1–P3 对应 PF001，P4–P7 对应 PF002，P8–P9 对应 PF003；三者共同映射 Space `F146`。
- 将 Partner 产品版本与 Space 主应用版本分开管理：Partner 从 `0.1.0` 建立自己的版本线，Space 根版本继续保持 `0.1.46-alpha.5`。
- 将 Partner 插件库的首个候选版本统一为 `0.1.0`；Extension ID 保持 `kodax.partner-library`，宿主兼容性继续由 Host API 和 capability 协商决定，而不是由显示版本号决定。
- 将企业微信、钉钉、腾讯会议、Notion、Airtable 与 Atlassian 明确标为 Preview：现阶段只有适配器、fixture 或契约证据，不声明真实企业/租户端到端已通过。
- 将 Slack 和 Zoom 保持为配置前置条件未满足时的 unavailable 状态；不得发起授权，也不得显示为已连接。
- 将删除、覆盖、共享权限变更、批量通知和审批决定保留在当前远程操作范围之外；修改既有资源继续走明确审核路径。

### Fixed

- 稳定飞书 receipt-first 回归测试：仍要求可信创建回执在内容回读被阻塞时先返回，但不再把单个 event-loop tick 当成产品时限；测试结束前同时等待相关后台内容校验收敛，避免临时目录清理竞态。

### Documentation

- 增加 Partner `0.1.0` 发布就绪记录，固定 `partner-v0.1.0` tag 命名、Core/Preview 边界、技术与真实服务门槛、许可证门槛和回滚条件。
- 增加面向 PF001–PF003 的 `0.1.0` 人工与发布验收指南，区分自动化 fixture、真实 Electron、人类观察、真实第三方服务和打包平台证据。

### Known limitations

- 当前没有最终 Git tag、远端 CI 或 GitHub Release；本地自动化、类型检查、lint 和 smoke build 已通过，但完整人工、真实服务、标准 Node 22.23.1、远端 CI 和分发授权仍未完成。
- 必须使用提供 Partner Host API 4 与 `partnerNativeDocumentDeliveryV1` 的兼容 Space 宿主；旧宿主应拒绝启用，不能通过降级绕过。
- 真实第三方账号、企业策略、多平台、同 ID 版本替换与回滚仍需按 release-readiness 单独记录；fixture、Mock 或目录展示不能证明真实服务可用。
- Extension HTML 的 SHA-256 只提供内容完整性检查，不构成发布者身份认证。
- 对外分发受仓库 [`LICENSE`](../../LICENSE) 约束；在取得适用书面授权前，不发布公开安装包或 Partner 分发物。

Partner 功能摘要同步至集成前的 Partner HEAD `0d1667d4c4b48abb05962ceeef4e4154309d14a7`。当前集成提交只吸收 Space `0.1.46-alpha.5`，不扩张上述 Partner 功能边界。

<!-- last-sync: 0d1667d4c4b48abb05962ceeef4e4154309d14a7 -->
