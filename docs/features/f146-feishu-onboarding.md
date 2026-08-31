# F146：飞书首次连接与简约连接器界面

> 2026-08-31：用户确认直接开发，不制作 Figma；参考 WorkBuddy 的连接交互，保留 Space 整体风格。
> 本文补充 P4/P5，不替换其文档范围与远端审核规则。宿主 0.1.45 / SDK 0.7.95 不变；独立库升级到 0.5.0。

## 1. 需求与产品边界

此前 P4/P5 只能验证已经配置的 CLI profile。本轮补齐首次连接，用户无需先在终端配置账号。
插件库继续是可独立安装、停用、卸载的 Space Extension；不增加执行引擎、不改变 Coder / Partner 共享 Skill。

- 连接器卡片只保留图标、名称、简要用途与操作，已连接使用文字和状态点共同表示。
- 点卡片进入可信宿主居中弹窗：未连接为“连接”；完成后为“解绑 / 去试试”。
- 未安装正确版本时，先解释安装官方 CLI 到 Space 自有目录，用户点击“安装并继续”才下载。不安装 Skill，不修改全局 CLI。
- 应用创建、扫码登录和授权使用飞书官方网页；不仿制登录页、二维码或自行收集飞书密码。
- 准备、安装、等待创建应用、等待用户授权、校验、完成、取消、过期和失败均有实际状态；可重开有效授权页、取消和重试。
- “去试试”回到原 Partner 对话，启用连接器且保留草稿，不自动发送消息。用户已切换会话/项目时不能把迟到结果绑定到新会话。
- 输入框为聚合连接器入口：逐账号的本会话开关、文档范围入口、管理连接器。全部关闭时入口仍可发现。
- 会话开关关闭只移除本会话绑定，不解绑账号；重新开启可以先绑定空文档范围。空范围不允许读取/写入任何文档，后续从原右侧详情明确授权。
- 右侧继续显示文档范围、资料、待审核和成果；账号首次连接不再占用大块右侧配置表单。
- 用户网页授权与 Space 的本会话资源授权、全局写入策略、逐项写入审批是不同环节。保留所有现有边界。

## 2. 公共接缝与接口

沿用原计划五组接缝：扩展 UI 消息桥、账号连接服务、会话绑定、受控 CLI、文档审核。本轮在账号连接接缝增加可取消的短任务：

| 接口                                    | 请求                                               | 返回                                     |
| --------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `partner.connectors.accounts`           | extensionId、connectorId                           | 本地公开 connections，不触发反复登录检测 |
| `partner.connectors.onboarding.start`   | extensionId、connectorId、installCli（默认 false） | job                                      |
| `partner.connectors.onboarding.get`     | extensionId、connectorId、id                       | job                                      |
| `partner.connectors.onboarding.cancel`  | extensionId、connectorId、id                       | job，取消完成后不会迟到绑定              |
| `partner.connectors.onboarding.reopen`  | extensionId、connectorId、id                       | ok；不接受 URL                           |
| `partner.connectors.onboarding.changed` | 宿主推送                                           | job                                      |

`PartnerConnectorOnboardingT` 仅含 id、extensionId、connectorId、phase、canReopen、可选 expiresAt / 固定安全 error / 公开 connection。
授权链接、device code、appSecret、token、原始 stdout/stderr 均不进入 IPC、扩展 frame、模型或普通日志。
phase 为 preparing / needs_install / installing / waiting_app / waiting_authorization / verifying / connected / cancelled / expired / failed。

全部新 IPC 仅接受主 renderer 的 primary main frame。扩展 frame 仍只请求连接器目录与打开可信宿主配置；卡片最多得到 connectedIds 汇总，不得到账号凭据、profile、文档范围或审批能力。

## 3. 官方接入与安全边界

采用已固定的官方 [CLI 1.0.92](https://github.com/larksuite/cli/releases/tag/v1.0.92)：

1. 检查已有 CLI 或 Space 私有二进制。安装需显式确认，使用固定官方 release 资产与 SHA-256，限制重定向、包体积、解包路径与普通文件类型；成功验证版本后原子放入私有目录。失败只清理本次 staging。
2. 宿主生成唯一 `space-<UUID>` profile，执行 `config init --new --brand feishu --name <profile>`，保留已有配置条目和默认选择。同名碰撞拒绝，不把 renderer 输入当 profile。凭据仍由官方 CLI 管理；如果用户在网页主动选择已有应用，官方按应用/用户保存 token，不承诺与其他 profile 的凭据完全隔离。
3. 配置完成后执行该 profile 的 `auth login --json --scope`，只请求当前文档读取、新建、追加所需三项权限；不使用全域 recommend。CLI 自身需要的 offline_access 保留。
4. 等待 CLI 结束后重新验证 `auth status --json --verify`、用户身份与实际 granted scopes；浏览器关闭、URL 已打开或出现二维码不等于连接成功。
5. 服务端账号提交沿用原 revision / 身份校验，并增加从任务开始起有效的许可，取消、停用、解绑后不得由迟到结果重新连接。

依据：[配置初始化](https://github.com/larksuite/cli/blob/v1.0.92/cmd/config/init.go)、[登录与流式 JSON](https://github.com/larksuite/cli/blob/v1.0.92/cmd/auth/login.go)、[权限结果](https://github.com/larksuite/cli/blob/v1.0.92/cmd/auth/login_result.go)。WorkBuddy 的内部实现未知，仅参考用户截图中可观察的交互。

- 普通读写 runner 保留 60 秒上限；授权使用单独有截止时间、限输出且可杀进程组的 runner，不阻塞一个长 IPC。
- 创建应用只打开官方 `https://open.feishu.cn/page/cli`，用户授权只接受精确 `https://accounts.feishu.cn` origin 返回链接；拒绝 userinfo、非标准端口、控制字符与伪造后缀域名。不重构授权 query。
- 每个连接器任务去重、有界保存、过期清理；退出取消进程；重启不恢复/重放授权链接或安装任务。
- 取消只停止 Space 的等待/进程，不能撤销网页已经创建的应用或授予的权限。解绑仅使 Space 本地连接失效，不自动 logout 用户 CLI 或删除第三方文档。
- 提交和取消须有明确顺序：取消成功返回后不允许新增连接；若提交已先完成，取消返回实际 connected，不伪装成 cancelled。
- 验证已有 profile 作为高级入口保留，仅验证绑定，不对它执行 config init 或替换用户凭据。

## 4. 实现票与验证

| 票  | 交付                         | 公共边界测试                                                                |
| --- | ---------------------------- | --------------------------------------------------------------------------- |
| O1  | 安全 typed IPC 与短任务控制  | 未确认不安装；不接受命令/任意链接/凭据；所有操作按任务归属校验              |
| O2  | 官方安装与授权适配           | 固定版本/校验和、越界/失败清理、流式 UTF-8、有效链接、取消/过期、scope 验证 |
| O3  | 账号提交与生命周期接线       | start 去重；取消/解绑/停用/落盘竞态；退出清理；无迟到会话修改               |
| O4  | 独立库卡片、弹窗和输入框开关 | 无自动授权、连接与开关分离、去试试保留草稿、零启用可管理、键盘/窄屏/明暗    |
| O5  | 回归、评审与桌面验证         | 全量单测、typecheck、lint、build、独立包、双轴评审、Electron 截图与交互     |

自动化使用受控网络、CLI 与账号夹具，不能冒充真实飞书连接。真实安装下载、用户扫码、远端权限和指定测试文档读写分别记录；未经用户实际授权的环节标为未执行。

## 5. 实施证据

### 代码与自动检查（2026-08-31）

- O1–O4 已实现，O5 的自动回归、评审和 macOS arm64 本地打包已执行；完整 F146 / P6 不标记完成。
- 新 IPC 测试从缺少模块失败开始，再实现为 3/3 通过；整个 schema 为 328/328。任务取消、落盘竞态、流式授权、安装包与 UI 的公共接缝分别有 RED → GREEN 记录。
- `partner-connectors/*.test.ts` 共 59/59 通过。该目录已测文件的行覆盖 95.44%、分支 81.16%；新任务 98.11% 行、安装器 93.81% 行、授权进程 96.43% 行、onboarding 适配 97.09% 行。这不是全应用覆盖率。
- 最终弹窗 / 聚合入口组件测试 8/8；延迟会话加载、同一事件周期内刷新、加载失败、恢复后的文档 / 文件夹 / 第二账号 / 草稿保留均有回归。不把 fake host 账号当作真实授权结果。
- `npm run typecheck`、`npm run lint`、`npm run build:smoke`、独立扩展构建及 `node scripts/pack.mjs --mac --arm64 --dir` 通过，包含 packaged SDK / Worker / SQLite / native dependency smoke。本地未签名，不发布；宿主 0.1.45 / SDK 0.7.95 不变。
- 最终 `NODE_OPTIONS=--no-experimental-webstorage npm test`：release 46/46、desktop 3129 通过 / 4 条件跳过、schema 328/328，合计 **3503 通过、4 跳过、0 失败**。直接 `npm test` 的旧通知测试出现日志计数 `3 !== 2`，在基线 `7bc2046` 的隔离源码中复现相同失败；按仓库此前已记录的 Node 25 参数重跑通过，未修改旧测试或生产逻辑。

### Standards

独立审阅本轮 48 个文件（不含四个原始用户改动），0 条可行动发现；独立运行 45 项定向回归通过。检查包含归档 / 网络来源、CLI / URL / IPC 边界、取消 / 断开 / 停用、独立 frame 数据投影和组件行为。

### Spec

发现 1 个 P2：已有会话正在加载时，“去试试”可能用空范围覆盖原绑定。已先复现，再在按钮及同步处理函数加入 loading / changing / error / context 校验，失败信息可见。独立复验全部 8 项弹窗测试通过；未解决发现 0。没有把两轴发现合并或将用户授权环节视作测试完成。

### 实际安装包与桌面边界

- 直接运行安装器下载官方 darwin-arm64 包时，180 秒外部测试截止被触发，staging 已清理。后续下载测得网络较慢；不能仅据 HEAD 成功认定 Node fetch 或代理存在故障，也不把这次尝试算作在线安装成功。
- 另用 curl 完整下载同一官方资产（13,799,162 字节），SHA-256 为 `abb1b96eee5ad32da4e12f434e44d48a9e01ebb0e81772419ac0347f91c34265`，与固定官方值一致。仅替换安装器的下载 transport 为该已下载归档，保留真实 checksum / 提取 / 私有目录发布 / 程序版本验证，最终真实执行返回 `lark-cli version 1.0.92`，exit 0。该 smoke 位于隔离临时目录，未运行 config init、auth login 或读写用户 CLI 账号。
- 同一隔离 QA profile 的独立插件已从 0.4.0 升到 0.5.0；最新打包 Electron 已启动，日志确认 renderer dom-ready / visual-ready 及主窗口显示。测试进程仍为离线 Mock，不用它声称真实模型执行成功。
- Computer Use 检查遇到 Mac 锁屏，无法获取新版画面或继续键盘 / 窄屏 / 明暗交互；未绕过锁屏，也没有产出或声称有新版验收截图。解锁后按 TC-018–024 继续。
- 剩余：完整在线自动下载（含慢网络）、真实飞书应用创建 / 扫码 / 权限授权、指定测试文档读写、Windows / Linux 实机安装、完整桌面视觉验收。必须由用户完成账号授权，不复制 WorkBuddy 的二维码、应用身份或凭据。
