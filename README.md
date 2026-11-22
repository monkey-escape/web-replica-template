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

然后按 `docs/playbook.md` 做：分析目标站、核对 `docs/experience/traps.md`、在 `apps/web` 与 `apps/api` 实现、跑 parity 循环、把教训写回经验库、当天复盘。路由是 strict 还是 adapt，看 `docs/adapt.md`。给 AI 的常驻说明在 `AGENTS.md`。

`.env.example` 里的 `DATABASE_URL` 和 `REDIS_URL` 是占位符。API 不会连接 Postgres 或 Redis。不要把真实密码写进仓库。

仓库页的 **Use this template** 要先在 GitHub 把本仓库标成 Template repository（Settings → General）。这次用 API 设置 `is_template` 时返回 403，当前身份改不了这项设置，需要仓库主人勾一次。按钮复制的是默认分支 `main`，模板内容进入 `main` 之后，生成出来的仓库才有这套骨架。

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
| `pnpm dev:web`                                 | Vite+ 开发服务器，`http://127.0.0.1:5173`                      |
| `pnpm dev:api`                                 | 先打包 `@replica/shared`，再启动 Hono，`http://127.0.0.1:3000` |
| `pnpm build`                                   | 打包共享库、API 和前端                                         |
| `pnpm test`                                    | 比较函数、门禁和两个脚本的自检，不需要浏览器                   |
| `pnpm browsers`                                | 安装 Playwright 的 Chromium                                    |
| `pnpm check`                                   | Vite+ 的格式、lint 和类型检查                                  |
| `node scripts/clone-loop.mjs --site <site-id>` | 分析门禁、测量、视觉比较；只报告失败路由                       |
| `node scripts/recap-daily.mjs`                 | 用当天提交和完整日志写 `docs/recap/`                           |

测量 example 骨架前，需要两个开发服务器，以及按 `fixtures/sites/example/analysis/screenshots/README.md` 在本机生成参考图。参考图依赖系统字体，所以不提交。

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
docs/adapt.md            strict 与 adapt
docs/experience          陷阱库和教训
docs/recap               每日复盘的说明和生成结果
scripts/clone-loop.mjs   克隆循环
scripts/recap-daily.mjs  每日复盘
temp/                    gitignore，循环报告和 diff
```

## 许可证

MIT。见 `LICENSE`。
