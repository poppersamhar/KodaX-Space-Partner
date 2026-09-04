# Partner 本地 Git 与 Space 融合工作流

这份文档用于管理 F146 Partner 插件库的长期开发。目标是同时满足三件事：本地改动可恢复、尚未完成的内容不会被误发布、Partner 能持续吸收 Coder 所在的 Space 上游变化。

## 仓库与分支职责

- `upstream`：同事维护的 `icetomoyo/KodaX-Space`，只拉取，不推送。
- `origin`：自己的 `poppersamhar/KodaX-Space-Partner`，准备好后才推送。
- `main`：只跟随 `upstream/main`，不直接开发 Partner。
- `feature/f146-partner-plugin-library`：F146 Partner 的长期集成分支。
- `feature/partner-host-<slice>`：Partner 主体、Host API、IPC、会话、安全执行与宿主适配的短期分支。
- `feature/partner-library-<slice>`：独立插件包、专家目录、连接器声明、插件 UI 与品牌资源的短期分支。
- `integration/partner-upstream-<date>`：临时验证某次上游同步，验证完成后再并回 F146。
- `archive/local-only-*`：只保存在本机的恢复分支，不合并、不推送。

从 2026-09-04 起，现有交叉历史不再重写。首批两个开发起点都从同一个已验证 F146 基线创建：

- `feature/partner-host-foundation`：用于稳定 Partner 宿主边界与融合接口。
- `feature/partner-library-foundation`：用于继续整理专家、连接器和插件库产品能力。

它们初始内容相同是正常的；分离的是从此之后的提交责任，不代表可以从任一分支删除另一侧已经依赖的代码。后续优先创建带具体主题的短分支，不把这两个起点继续扩张成互相长期漂移的第二、第三集成干线。

2026-09-04 的已知恢复点：

- Partner 可集成基线：`7c869d1`。
- 未审核本地材料归档：`archive/local-only-f146-unreviewed-20260904`，提交 `1b45875`。
- 当次上游基线：`upstream/main` 的 `1a310ae`，标签 `v0.1.46-alpha.3`。

## 每次开始和结束开发

开始前先确认自己在哪个分支：

```sh
git status --short --branch
```

不要在 `main` 上修改。一个行为完成后就提交，不再把数天的工作堆成一个工作区快照：

```sh
git add <本次功能相关路径>
git diff --cached --check
git diff --cached
git commit
```

提交标题沿用仓库规范：

```text
feat(partner): ...
fix(partner-connectors): ...
test(partner): ...
docs(f146): ...
```

提交正文至少说明用户效果、关键边界、已运行的验证和仍未完成的人工或发布步骤。`git commit` 是本地版本；`git push` 只是把分支备份到 GitHub；只有发布标签和 Release 才代表产品发布。

## Partner 短分支生命周期

先从干净、最新的 F146 集成分支创建一个具体切片：

```sh
git switch feature/f146-partner-plugin-library
git status --short --branch
git switch -c feature/partner-host-<slice>
```

插件库切片则使用 `feature/partner-library-<slice>`。一个切片只承担一个可说明、可验证的结果；如果功能同时需要宿主能力和插件声明，先完成并合入宿主接缝，再从更新后的 F146 创建插件库切片。

完成代码、评审和验证后合回 F146，并删除已完成的本地短分支：

```sh
git switch feature/f146-partner-plugin-library
git merge --no-ff feature/partner-host-<slice>
git branch -d feature/partner-host-<slice>
```

不要直接在两个功能分支之间互相合并；共同依赖统一先进入 F146，再由新的切片从最新 F146 开始。

## 同步同事的 Coder / Space 改动

只在工作区已经提交干净时同步。长期 Partner 分支采用 merge，不反复 rebase 改写历史：

```sh
git fetch --all --prune
git switch feature/f146-partner-plugin-library
git switch -c integration/partner-upstream-YYYYMMDD
git merge --no-ff --no-commit upstream/main
```

解决冲突、暂存合并结果并完成验证后：

```sh
git add <已解决的路径>
NODE_OPTIONS=--no-experimental-webstorage npm test
npm run typecheck
npm run lint
npm run build:smoke
git diff --check
git commit -m "chore(integration): merge upstream baseline"
git switch feature/f146-partner-plugin-library
git merge --ff-only integration/partner-upstream-YYYYMMDD
git branch -d integration/partner-upstream-YYYYMMDD
```

推荐至少每周同步一次，并在每次准备可安装版本之前再同步一次。不要在脏工作区直接执行 `git pull`。

基于完整 Partner 基线与 `upstream/main` 预演出的 13 个文本冲突有：

- `apps/desktop/electron/ipc/session.ts`
- `apps/desktop/electron/ipc/version.ts`
- `apps/desktop/electron/kodax/real-session.ts`
- `apps/desktop/electron/kodax/session-runtime-store.ts`
- `apps/desktop/package.json`
- `apps/desktop/renderer/src/i18n/messages.ts`
- `apps/desktop/renderer/src/shell/ModeSelector.tsx`
- `docs/FEATURE_LIST.md`
- `package-lock.json`
- `package.json`
- `packages/space-ipc-schema/package.json`
- `packages/space-ui-kit/package.json`
- `scripts/smoke-pack.mjs`

即使 Git 自动合并，也要重点复查 `host.ts`、`session-adapter.ts`、Coder action manifest、`BottomBar.tsx`、`ModeSelector.tsx`、Space Control、IPC schema、package/lockfile 和打包脚本。这些位置同时影响 Coder 与 Partner，文本无冲突不等于行为兼容。

## Partner 与 Coder 的长期代码边界

OAuth、CLI、凭据、会话授权、资源范围、写入审核和真实远端调用继续属于 Space Electron 主进程中的可信宿主。Partner 插件页面只声明专家、连接器与隔离 UI，不持有凭据，也不复制一套 Runtime。

共享主链路应逐步稳定为：

```text
Coder / Partner UI
        ↓
带版本的 IPC / Contribution Contract
        ↓
Space Trusted Host
        ├── Coder Runtime Adapter
        └── Partner Runtime Adapter
              └── Connector / OAuth / CLI / Reviewed Write Services
```

共享的 `real-session.ts`、Shell 和 schema 只依赖稳定接口。新增 Partner 能力优先落在 Partner adapter、connector service 和 Partner UI 目录；不要继续让 Coder manifest 逐个排除 Partner channel，也不要在共享文件里无限增加 `surface === 'partner'` 分支。

日常 Host API、IPC 和 Partner 宿主兼容改造归入 `feature/partner-host-*`；只有吸收一份新的 `upstream/main` 并处理其冲突时，才使用 `integration/partner-upstream-*`。插件包不应通过修改 Coder 业务逻辑来获得能力。

## 版本号

- Space 应用版本跟随实际合入的 `upstream` 发布线，不为每个 Partner 提交升级。
- Partner Library 使用独立 SemVer；当前 manifest 为 `0.9.1`。
- `hostApiVersion` 只在宿主协议出现不兼容变化时升级。
- 功能可用性通过 `requiredHostCapabilities` 与宿主能力握手判断，不按应用或插件版本字符串猜测。
- 如果同步后仍需发布临时整包，版本名应绑定真实上游基线，例如 `0.1.46-partner.1`；最终名称在完成上游同步后确定。

当前文档仍混有 Partner Library `0.9.0` / `0.5.1`，应用包仍写 `0.1.61-p.1`。这些是发布阻塞项，但不影响本地恢复基线；不能据此打标签。

## 推送与发布门槛

准备把功能分支备份到自己的 GitHub 时，显式执行：

```sh
git push -u origin feature/f146-partner-plugin-library
```

首次推送前必须重新检查：

- 工作区干净，且没有 `.env`、密钥、真实账号数据、本机绝对路径或未经审核截图。
- 已同步并验证最新 `upstream/main`。
- 完整自动测试、类型检查、lint 和打包 smoke 通过。
- 真实连接器验收与自动夹具结果分开记录；夹具不能宣称第三方真实成功。
- package、lockfile、Partner manifest、CHANGELOG 和 release-readiness 的版本一致。

正式发布时再创建唯一的 release commit、annotated tag 和 GitHub Release。不要给当前 InProgress 的 F146 基线打发布标签。

## 恢复本地归档材料

先查看归档内容，不要整分支合并：

```sh
git show --stat archive/local-only-f146-unreviewed-20260904
```

确认截图、路径、图标或权限变化确实可以公开后，只恢复明确需要的路径：

```sh
git restore --source=archive/local-only-f146-unreviewed-20260904 --worktree -- <path>
```

修正本机绝对路径、授权或来源问题后，再作为独立提交加入功能分支。
