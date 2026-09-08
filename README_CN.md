# KodaX Space Partner

**把专家、工作资料和连接器放进同一个对话，完成日常办公与知识工作。**

Partner 是基于 [KodaX Space](https://github.com/icetomoyo/KodaX-Space) 开发的办公协作产品线。在 Space 的桌面客户端和 Agent 运行能力之上，增加了岗位与任务专家、方法 Skill、办公连接器，以及任务资料和交付成果工作区。

[下载 Partner 0.1.0](https://github.com/poppersamhar/KodaX-Space-Partner/releases/tag/partner-v0.1.0) · [Partner 功能记录](https://github.com/poppersamhar/KodaX-Space-Partner/blob/integration/partner-upstream-20260904-v0.1.0/docs/partner/FEATURE_LIST.md) · [更新日志](https://github.com/poppersamhar/KodaX-Space-Partner/blob/integration/partner-upstream-20260904-v0.1.0/docs/partner/CHANGELOG.md) · [开发源码](https://github.com/poppersamhar/KodaX-Space-Partner/tree/integration/partner-upstream-20260904-v0.1.0)

## Partner 可以帮你做什么

| 办公场景 | 使用方式与成果 |
| --- | --- |
| 调研一个主题 | 选择研究专家，结合资料梳理信息、比较观点，形成有来源的结论 |
| 分析一份数据 | 选择数据分析专家，检查数据、分析趋势并生成可视化 |
| 打磨文案与邮件 | 明确受众、目的和语气，起草或修改内容 |
| 整理会议与推进项目 | 提炼会议决策、行动项、负责人和未决问题，准备工作汇报 |
| 沉淀团队知识 | 将材料整理为知识文档、流程与 SOP，准备入职资料 |
| 准备演示 | 组织叙事、页面和视觉内容，制作 HTML 演示文稿 |

可以直接描述任务，也可以从首页任务卡开始；任务卡关联对应专家和方法，填写需求后再发送。

## 0.1.0 已构建的能力

### 16 位专家，配套可复用的方法 Skill

专家分为 **7 位岗位专家和 9 位任务专家**，覆盖产品管理、用户研究、项目管理、营销文案、客户支持、销售拜访、招聘面试，以及研究、数据分析、邮件、会议纪要、汇报、SOP、知识整理、入职和演示制作。

- 每位专家有独立头像、能力介绍、任务示例、所需资料和交付要求。
- 专家由角色指令和默认方法 Skill 组成；方法可以单独关闭。
- 选择专家后，其工作方式在当前会话持续生效，支持切换、移除和重启恢复。
- 专家复用当前 Partner Agent 与会话授权的连接器，不会因为选择专家额外启动一个独立 Agent。

### 13 个连接器目录项

| 类别 | 服务 |
| --- | --- |
| 文档与协作 | 飞书、腾讯文档、企业微信、钉钉、Notion |
| 邮箱 | 网易邮箱、QQ 邮箱 |
| 会议 | 腾讯会议、Zoom |
| 团队与研发 | Airtable、Atlassian、Slack、GitHub |

连接器复用账号配置、会话授权范围、资料详情与右侧网页打开能力。具体操作依各服务提供的接口而定：例如飞书支持部分资料读取和文档操作，邮箱支持查阅与回复草稿，GitHub 支持选定仓库 README、Issue 和 PR 正文读取。

**目录收录不代表所有能力均已实测。** 飞书之外，多数连接器仍处于 Preview，真实账号验证范围不同；腾讯会议与 Zoom 当前主要读取会议基本信息，邮箱草稿不会自动发送。具体范围以连接器详情与验收记录为准。

### 围绕任务组织的工作界面

- 冷启动首页提供专家、连接器、工作资料和六个常用任务入口。
- 输入框显示当前专家头像；连接器操作放在输入框上方。
- 侧栏直接展示任务资料、任务协作和任务产物。
- 资料与成果可以打开详情，并通过共享机制在右侧查看可信页面。
- 文件格式直接在对话中提出，无需预先选择交付格式；实际生成能力依任务和可用工具而定。

## 下载与开始使用

当前版本为 **Partner 0.1.0 预发布版**，配套宿主为 Space `0.1.46-alpha.5`，使用 KodaX SDK `0.7.96-beta.1`。Partner 版本与宿主版本分别管理。

| 系统 | 下载 |
| --- | --- |
| Windows x64 安装版 | [下载安装程序](https://github.com/poppersamhar/KodaX-Space-Partner/releases/download/partner-v0.1.0/KodaX-Space-Partner-Setup-0.1.0-x64.exe) |
| Windows x64 免安装版 | [下载免安装程序](https://github.com/poppersamhar/KodaX-Space-Partner/releases/download/partner-v0.1.0/KodaX-Space-Partner-Portable-0.1.0-x64.exe) |
| macOS Apple Silicon | [下载 arm64 ZIP](https://github.com/poppersamhar/KodaX-Space-Partner/releases/download/partner-v0.1.0/KodaX-Space-Partner-0.1.0-arm64.zip) |
| Partner 插件（上述平台均需安装） | [下载 .space-extension](https://github.com/poppersamhar/KodaX-Space-Partner/releases/download/partner-v0.1.0/kodax.partner-library-0.1.0.space-extension) |

1. 下载并安装或解压对应平台的应用。
2. 下载同一 Release 的 `kodax.partner-library-0.1.0.space-extension`，在应用的扩展管理中安装并启用。
3. 配置可用模型，进入 Partner，选择专家、添加工作资料或配置需要的连接器。
4. 输入具体任务并发送；需要文件时，在对话中说明格式和要求。

请使用本仓库提供的配套宿主，旧版 Space 未必兼容当前 Partner Host API。预发布版采用手动下载更新。

当前安装包未签名，Mac 包未公证；Windows 免安装版的用户数据仍保存于用户目录。本次未提供 Intel Mac 或 Linux 安装包。校验文件和详细说明见 [Release 页面](https://github.com/poppersamhar/KodaX-Space-Partner/releases/tag/partner-v0.1.0)。

## 验证范围

已完成本地类型检查、构建、插件归档及部分真实 Electron 专家流程验证；Windows 专项 CI 的构建、打包与启动检查已通过。完整跨平台 CI、所有真实企业账号及全部业务场景尚未验证。全量测试仍有一次 SDK 隔离用例偶发失败，定向复测通过，不能视为整轮零失败。

专家输出的数据、日期和对外承诺仍需复核；HTML 演示制作不等同于原生 PPTX 输出。详见 [发布说明与验证记录](https://github.com/poppersamhar/KodaX-Space-Partner/blob/integration/partner-upstream-20260904-v0.1.0/docs/partner/releases/partner-v0.1.0-notes.md)。

## 源码与开发

仓库默认分支保留 Space 基线；**Partner 当前开发代码位于 `integration/partner-upstream-20260904-v0.1.0` 分支**，已发布版本对应 `partner-v0.1.0` 标签。运行 Partner 请明确检出对应分支：

```bash
git clone --branch integration/partner-upstream-20260904-v0.1.0 https://github.com/poppersamhar/KodaX-Space-Partner.git
cd KodaX-Space-Partner
npm ci
npm run dev
```

Node.js 版本见该分支的 `.nvmrc`。开发启动宿主后，仍需安装并启用 Partner 扩展；先运行 `npm run build:packages`，再运行 `npm run build:partner-extension` 构建扩展归档，构建与安装步骤见 [插件说明](https://github.com/poppersamhar/KodaX-Space-Partner/blob/integration/partner-upstream-20260904-v0.1.0/extensions/partner-library/README.md)。

- [Partner 文档入口](https://github.com/poppersamhar/KodaX-Space-Partner/blob/integration/partner-upstream-20260904-v0.1.0/docs/partner/README.md)
- [Partner 功能与进度](https://github.com/poppersamhar/KodaX-Space-Partner/blob/integration/partner-upstream-20260904-v0.1.0/docs/partner/FEATURE_LIST.md)
- [专家开发方法](https://github.com/poppersamhar/KodaX-Space-Partner/blob/integration/partner-upstream-20260904-v0.1.0/docs/partner/features/EXPERT_BUILDER.md)
- [连接器共享能力与验证](https://github.com/poppersamhar/KodaX-Space-Partner/blob/integration/partner-upstream-20260904-v0.1.0/docs/partner/features/PF004-shared-connector-validation.md)
- [Windows 构建与验证](https://github.com/poppersamhar/KodaX-Space-Partner/blob/integration/partner-upstream-20260904-v0.1.0/docs/partner/releases/v0.1.0-windows-validation.md)

## 上游与许可

本项目基于 **icetomoyo** 开发的 [KodaX Space](https://github.com/icetomoyo/KodaX-Space)，保留其桌面宿主、编码工作区与相关基础能力；本仓库重点开发 Partner 办公协作部分。Partner 预发布不代表已合入上游 Space 主线。

保留上游作者、版权和 [KAI-FCL 许可证](LICENSE)。第三方依赖及复用 Skill 继续遵循各自许可证与来源说明；本仓库的公开发布不改变这些条款。
