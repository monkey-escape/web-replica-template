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
