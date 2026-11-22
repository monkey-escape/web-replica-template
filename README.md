# web-replica-template

Reusable 1:1 website clone template: Vite+ frontend, Hono API, a Playwright parity loop, and an experience store.

下一个站点克隆从这里复制或 fork，而不是从零搭工具链。模板只提供方法和可运行的骨架。它不包含任何真实店铺、真实账号，或从其他网站复制来的内容。

建议的 GitHub 仓库描述：

> Reusable 1:1 website clone template: Vite+, Hono, parity loop, and an experience store.

## 环境

- Node.js `^22.18.0`、`^24.11.0` 或 `>=26`（与 Vite+ 1.7 一致）
- pnpm `10.33.4`（`packageManager` 字段）
- 只用 pnpm，不要用 npm 或 yarn 安装依赖

## 开始一个新克隆

```bash
git clone https://github.com/monkey-escape/web-replica-template.git my-clone
cd my-clone
pnpm install
cp .env.example .env
pnpm browsers
```

然后按 `docs/playbook.md` 做：分析目标站（含共用组件和 API mock 决定，见 `docs/api-mocks.md`）、核对 `docs/experience/traps.md`、先实现共用组件再拼页面、跑 parity 循环、把教训写回经验库、当天复盘。目标站后来改版时走 `docs/target-update.md`（先 `compare-target`，再 `--accept`，再测差值），这和把本模板当 `upstream` 做 `git fetch` 不是同一件事。路由是 strict 还是 adapt，看 `docs/adapt.md`。给 AI 的常驻说明在 `AGENTS.md`。

`.env.example` 里的 `DATABASE_URL` 和 `REDIS_URL` 是占位符。API 不会连接 Postgres 或 Redis。不要把真实密码写进仓库。

仓库页的 **Use this template** 要先在 GitHub 把本仓库标成 Template repository（Settings → General）。这次用 API 设置 `is_template` 时返回 403，当前身份改不了这项设置，需要仓库主人勾一次。按钮复制的是默认分支 `main`，模板内容进入 `main` 之后，生成出来的仓库才有这套骨架。

## 用 DeepSeek Harness 开一轮克隆

组合包在 `harness/dsh-web-replica/`。它按 [Harness 的 bundle 格式](https://github.com/deepseek-ai/deepseek-harness/blob/d98f5d68519215da48f3002da2cb9c9d2068d81d/docs/user/develop/basic/publish.md) 发布：`package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`。preset 行使用已安装的 `@deepseek-ai/dsh-agent-preset`，这个仓库不内置、也不 fork Harness。

在已经装好 `dsh` 的机器上，从本仓库根目录把组合包加进一个 profile：

```bash
dsh plugin --profile <profile> add ./harness/dsh-web-replica
```

然后启动这个 profile，在 preset 名单里选 **1:1 website replica**（id `web-replica`）。新会话才会用上刚装的 preset。这个 preset 只有这一项，不会另起一套方法：persona 写明阶段顺序和硬约束，skills 给出命令，`replica_check_gates` / `replica_capture_sections` / `replica_capture_api` / `replica_compare_target` / `replica_clone_loop` 是同一批仓库脚本的官方工具包装。仍可用 bash / fs / web 直接跑这些脚本。顺序是：先分析（共用组件、API mock、媒体和样式）并通过 `check-gates`，先实现共用组件再拼页面，再用 `clone-loop` 只修 `report.next`，绿了写教训，当天用 `node scripts/recap-daily.mjs` 复盘。目标站改版走 `docs/target-update.md`。详见 `harness/dsh-web-replica/README.md`。

`engines.dsh` 写成 `>=0.2.3-alpha.1 <0.3.0`，对齐写这份组合包时的 Harness `0.2.3-alpha.1`。子插件（persona、文件、shell、skill）由正在运行的 `dsh` 解析，不写进本仓库的依赖。

## 下游私有仓库跟上模板

已有的私有克隆不要把本仓库改成自己的 `origin`。`origin` 仍是私有仓库，本仓库只作为 `upstream`。`monkey-escape/web-replica` 就是这样用的：站点内容留在私有仓库，模板更新从这里拉。

在私有仓库的根目录执行一次：

```bash
git remote add upstream https://github.com/monkey-escape/web-replica-template.git
git fetch upstream
```

`upstream` 已经存在时，不要重复添加，直接 `git fetch upstream`。

拉下来之后，把 `upstream/main` 合进当前私有分支。两条都可以，按分支有没有被别人使用来选：

```bash
git merge upstream/main
```

```bash
git rebase upstream/main
```

- 用 merge：私有分支已经推送、或有别人在上面工作时用这个。历史会保留一次合并，不需要改写远端提交。
- 用 rebase：分支还只在本地、或只有你自己使用时用这个。模板提交会留在私有提交下面。分支如果已经在远端，rebase 之后要自己决定是否 `git push --force-with-lease`。不要对这个公开仓库的 `main` 做 force push。
- 冲突在私有仓库里解决。不要把 `.env`、账号、目标站的私有页面或业务代码推回 `upstream`。
- 合完或变基完，在私有仓库里跑 `pnpm install`，再按 `docs/playbook.md` 继续这个站点。不要把私有站点的提交开回本模板的 pull request，除非改的是模板方法本身。

## 命令

| 命令                                           | 作用                                                           |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `pnpm dev:web`                                 | Vite+ 开发服务器，`http://127.0.0.1:5173`，代理 `/api` 和 `/media` |
| `pnpm dev:api`                                 | 先打包 `@replica/shared`，再启动 Hono，`http://127.0.0.1:3000`；本地 `/media` 从 fixtures 提供 |
| `pnpm build`                                   | 打包共享库、API 和前端                                         |
| `pnpm test`                                    | 比较函数、门禁和两个脚本的自检，不需要浏览器                   |
| `pnpm browsers`                                | 安装 Playwright 的 Chromium                                    |
| `pnpm check`                                   | Vite+ 的格式、lint 和类型检查                                  |
| `node scripts/capture-assets.mjs --site <site-id>` | 按 manifest 把公开资源下到 `fixtures/sites/<site-id>/assets/` |
| `node scripts/clone-loop.mjs --site <site-id>` | Oracle 循环：测量、区块打分、可维护性；只指出下一刀。见 `docs/oracle.md` |
| `node scripts/recap-daily.mjs`                 | 用当天提交和完整日志写 `docs/recap/`                           |

测量 example 骨架前，需要两个开发服务器，以及按 `fixtures/sites/example/analysis/screenshots/README.md` 在本机生成桌面 1440 和手机 390 的参考图。参考图依赖系统字体，所以不提交。静态资源走 `/media/<site-id>/<key>`，见 `docs/media.md`。

Cloudflare 只有根目录 `wrangler.jsonc` 里的一个 Worker，入口是 `apps/api/src/worker.ts`。本地账号、路由和其他部署差异放在被忽略的 `wrangler.local.jsonc` 或 `deploy.local.jsonc`。

## 目录

```text
apps/web                 Vite+ 前端骨架
apps/api                 Hono API（Node 入口 + 一个 Worker 入口）
packages/shared          共享类型，vp pack 产出
packages/parity          测量、视觉比较、门禁、复盘的实现
tests/parity             measure.mjs、visual.mjs、路由档案
fixtures/sites/example   占位分析，不是外部网站
docs/playbook.md         六步流程
docs/oracle.md           循环裁定、完成态和残差
.agents/notes            产品决策（AGENTS.md 保持短）
docs/media.md            本地 /media 服务与之后换到 R2 的约定
docs/adapt.md            strict 与 adapt
docs/experience          陷阱库和教训
docs/recap               每日复盘的说明和生成结果
scripts/clone-loop.mjs   克隆循环
scripts/capture-assets.mjs  按 manifest 下载公开资源
scripts/capture-sections.mjs 从目标站（`--from-target`）或克隆记录区块与计算样式
scripts/recap-daily.mjs  每日复盘
temp/                    gitignore，循环报告和 diff
```

## 许可证

MIT。见 `LICENSE`。
