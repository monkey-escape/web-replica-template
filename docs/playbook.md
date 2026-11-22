# 克隆操作手册

用这个仓库开始一个新的网站 1:1 克隆时，按下面的顺序做。不要跳过分析，也不要在 strict 路由还没对齐时改阈值收工。

这里的方法是通用的：先看清目标，再查以前的坑，然后只在 `apps/web` 和 `apps/api` 里实现，用 Playwright 测量和视觉对比只追失败项，最后把教训写回经验库。不要从别的产品仓库拷贝业务代码、文案、环境文件或账号。

## 0. 从模板起一个新目录

```bash
git clone https://github.com/monkey-escape/web-replica-template.git my-clone
cd my-clone
pnpm install
cp .env.example .env
pnpm browsers
```

`.env` 里的 `DATABASE_URL` 和 `REDIS_URL` 继续保持占位，除非这个克隆真的要接数据库。模板的 API 不会读取它们。

给站点起一个 id：小写字母、数字、单个连字符，例如 `northwind`。后文记为 `<site-id>`。

## 1. 先分析目标站

在写 `apps/web` 之前，把观察结果放进 `fixtures/sites/<site-id>/`。可以复制 `fixtures/sites/example/` 再改掉。example 只是模板骨架，不是某个真实网站。

必须有这些文件，而且不能是空壳：

| 文件                       | 要写清楚的内容                                                     |
| -------------------------- | ------------------------------------------------------------------ |
| `analysis/overview.md`     | 整站怎么分路由。正文里要覆盖截图、结构、组件、交互、token 五件事   |
| `analysis/screenshots/`    | 目标站整页截图，文件名与路由名一致                                 |
| `analysis/tokens.json`     | 颜色、字体、间距、圆角。实现时用这些值，不要另起一套               |
| `analysis/components.md`   | 可以复用的块，以及页面上的 `data-component` 名                     |
| `analysis/interactions.md` | 点击、提交、展开这类会改变页面的行为，以及成功时页面上应出现的文本 |
| `structure.json`           | 每条路由的地标、标题、组件、交互，顺序与 DOM 一致                  |
| `baselines/<route>.png`    | 1280×720、缩放 1 的整页参考图                                      |

参考图只在分析阶段生成或从目标站截取。命令是：

```bash
node tests/parity/visual.mjs --site <site-id> --capture-reference --allow-strict-capture
```

这条命令写完参考图后仍然以失败退出。它不是测量通过。修复循环里禁止再跑它，否则等于用克隆结果覆盖目标。

同时写好 `tests/parity/profiles/<site-id>.json`。每条路由的 `mode` 只能是 `strict` 或 `adapt`。哪条该用哪种，看 `docs/adapt.md`。

## 2. 先读经验库，再写代码

打开：

- `docs/experience/traps.md`
- `docs/experience/lessons/` 里每一篇

把还有效的陷阱（`status: active`）对照这个站点过一遍，写到 `fixtures/sites/<site-id>/traps-checked.md`。

- 没有 active 陷阱时，文件里要有一行 `active-traps: none`。
- 有 active 陷阱时，每个 id 都要出现，并写这个站点会不会踩到、准备怎么避开。
- 不要把别的私有项目里的陷阱默写进来。经验库里没有的，就不算数。

`node scripts/clone-loop.mjs --site <site-id>` 在这一步的文件齐之前不会开浏览器。

## 3. 只在两个应用里实现

- 页面、样式、客户端交互：`apps/web`。工具链是 Vite+（`vp dev` / `vp build`），配置在 `apps/web/vite.config.ts`。
- HTTP API：`apps/api`。Hono 应用在 `src/app.ts`，Node 启动在 `src/index.ts`。
- 两边都要用的类型和纯函数：`packages/shared`。改完先 `pnpm --filter @replica/shared build`。
- 测量逻辑：`packages/parity` 和 `tests/parity`。不要把某个站点的业务写进这里。

本地同时开：

```bash
pnpm dev:api
pnpm dev:web
```

Web 在 `http://127.0.0.1:5173`，并把 `/api` 代理到 `http://127.0.0.1:3000`。

Cloudflare 只保留根目录 `wrangler.jsonc` 里的那一个 Worker，入口是 `apps/api/src/worker.ts`。不要加 KV、R2、D1、队列或第二个 Worker。账号和路由写在被 gitignore 的 `wrangler.local.jsonc`，不要写进提交。

Postgres 和 Redis 不是这个模板的运行时。需要它们的克隆再加驱动，并继续把真实 URL 留在 `.env`。

## 4. 测量，并且只重做失败项

```bash
node scripts/clone-loop.mjs --site <site-id>
```

循环会调用：

- `tests/parity/measure.mjs`：地标、标题、`data-component`、`data-interaction`，以及档案里的点击检查
- `tests/parity/visual.mjs`：整页截图对 `baselines/<route>.png` 做像素比较

报告在 `temp/clone-loop/<site-id>/report.json`。`failed` 里只有没过的路由。已经通过的路由不要顺手重做。

退出码：

| 码  | 含义                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------- |
| 0   | 全部通过                                                                                                          |
| 1   | 分析或陷阱门禁没过，或某一相没有跑完                                                                              |
| 2   | 还有 strict 路由不是 1:1。必须继续修，不能把该路由改成 adapt，也不能给它加 `accepted` 或放宽 `strictMaxDiffRatio` |
| 3   | 只剩 adapt 路由失败。先修；只有 `docs/adapt.md` 允许的那类差异才能写进档案                                        |

strict 的像素差比例默认是 0。缺参考图（`baseline-missing`）也算没过。

单独重跑一相：

```bash
node tests/parity/measure.mjs --site <site-id>
node tests/parity/visual.mjs --site <site-id>
```

## 5. 把教训写回去

strict 全部对齐、循环退出 0 之后：

```bash
node scripts/clone-loop.mjs --site <site-id> --write-lesson --slug <slug>
```

编辑生成的 `docs/experience/lessons/YYYY-MM-DD-<slug>.md`。

- 这一轮如果没有真实失败，就写没有新陷阱，并删掉空的 yaml 块。
- 有真实失败时，把 yaml 追加到 `docs/experience/traps.md`，`status` 保持 `active`。
- 不要编造一个没发生过的陷阱来充实仓库。

## 6. 当天复盘，并清掉腐烂代码

```bash
node scripts/recap-daily.mjs
```

脚本用 UTC 日期汇总：

- 当天 `git log`
- `temp/clone-loop/**/*.json` 里 `complete: true` 的日志
- 没有 `complete: true` 的日志只点名，不拿来下结论

输出写到 `docs/recap/YYYY-MM-DD.md`。已存在时加 `--force` 才覆盖。

可删除的残留只有三类：第一行含 `@replica-rotten` 的文件、`*.bak` / `*.orig` / `*.obsolete.*`、以及 `temp/`。确认列表之后：

```bash
node scripts/recap-daily.mjs --apply-clean
```

不要用手删仍被引用的源码，也不要让脚本去猜「看起来没用」的文件。

## 模板自检

不启动浏览器也可以确认门禁和比较函数：

```bash
pnpm test
```

`fixtures/sites/example` 会走同一套门禁。它的参考图需要本机字体，所以不提交。要看完整的 strict 循环，按 example 的 `analysis/screenshots/README.md` 生成参考图后再跑 `--site example`。
