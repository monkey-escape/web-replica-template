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

私有仓库已经存在时，不要重新 clone 盖掉它。按根目录 `README.md` 的「下游私有仓库跟上模板」：把 `https://github.com/monkey-escape/web-replica-template.git` 加为 `upstream`，`git fetch upstream`，再 `git merge upstream/main` 或 `git rebase upstream/main`。`origin` 保持私有仓库。

给站点起一个 id：小写字母、数字、单个连字符，例如 `northwind`。后文记为 `<site-id>`。

## 1. 先分析目标站

在写 `apps/web` 之前，把观察结果放进 `fixtures/sites/<site-id>/`。可以复制 `fixtures/sites/example/` 再改掉。example 只是模板骨架，不是某个真实网站。

必须有这些文件，而且不能是空壳：

| 文件                                | 要写清楚的内容                                                     |
| ----------------------------------- | ------------------------------------------------------------------ |
| `analysis/overview.md`              | 整站怎么分路由。正文里要覆盖截图、结构、组件、交互、token 五件事   |
| `analysis/screenshots/`             | 目标站整页截图，每个视口一份，例如 `home.desktop.png`、`home.mobile.png` |
| `analysis/tokens.json`              | 颜色、字体、间距、圆角。实现时用这些值，不要另起一套               |
| `analysis/components.md`            | 先列出共用组件（页头、页脚、导航、重复卡片等）和页面专用块；每个共用组件写明出现在哪些路由。没有共用块时必须写 `shared-components: none`。空壳或 `shared-components: pending` 不能过门禁 |
| `analysis/interactions.md`          | 点击、提交、展开这类会改变页面的行为，以及成功时页面上应出现的文本 |
| `structure.json`                    | 每条路由的地标、标题、组件、交互，顺序与 DOM 一致。某个视口结构不同时，可另写 `<route>.desktop` / `<route>.mobile` 键 |
| `assets/README.md`                  | 本地媒体清单说明。分析阶段必须把公开图片、字体、视频下到 `assets/` |
| `assets/manifest.json`              | 资源来源 URL 与稳定对象键                                          |
| `api/manifest.json`                 | 公开 API mock 的决定：已捕获的 items，或明确的 `apiMocks: "none"`。缺文件或 `pending` 不能过门禁 |
| `baselines/<route>.desktop.png`     | 桌面宽度 1440、缩放 1 的整页参考图                                 |
| `baselines/<route>.mobile.png`      | 手机宽度 390、缩放 1 的整页参考图                                  |

档案里的 `viewports` 必须包含 `desktop`（宽度 1440）和 `mobile`（宽度 390）。这是 ShopSite 实践，不要只测一个桌面宽度。截图前会隐藏滚动条，避免整页宽度变成 1457。

分析阶段还要把目标站的公开图片、字体和视频下载到 `fixtures/sites/<site-id>/assets/`，并把页面里的运行时地址改成 `/media/<site-id>/<key>`。不要在运行时热链到目标站。做法见 `docs/media.md`：

```bash
node scripts/capture-assets.mjs --site <site-id>
```

公开页若会打目标站的数据接口，同样要在分析阶段用被动监听把公开 JSON 收到 `fixtures/sites/<site-id>/api/`，并把运行时地址改成 `/api/mock/<site-id>/<key>`。不要在运行时热链到目标站 API。脚本只在加载公开页面时听网络，不会把浏览器导航到 `/api/` 或 `/requisition`。若公开站没有这类数据接口，在 `api/manifest.json` 里写明 `apiMocks: "none"`。分析在这件事上没做决定之前不算完成。做法见 `docs/api-mocks.md`：

```bash
node scripts/capture-api.mjs --site <site-id>
```

`analysis/components.md` 必须分清共用组件和页面专用块，并写下每个共用组件出现的路由。没有共用块时写 `shared-components: none`。在共用组件识别完成之前，不要开始实现路由页面。实现顺序是：先做共用组件，再用它们去拼各条路由。

还要从线上目标站抓区块几何框和计算样式（只读公开页；年龄门可以关掉；不要登录，不要打开 `/api/` 或 `/requisition`，不要向目标站提交表单）。档案里可写可选字段 `targetBaseUrl`。结果写到 `fixtures/sites/<site-id>/styles/`，并把目标站的 `box` / `targetSelector` 合并进 `sections.json`，不要覆盖克隆侧的 `selector`。做法见 `docs/oracle.md`：

```bash
node scripts/capture-sections.mjs --site <site-id> --from-target
node scripts/capture-sections.mjs --site <site-id> --from-target --target https://www.example.com --route home
```

`--from-clone` 只刷新克隆侧证据，写到 `temp/clone-loop/<site-id>/clone-styles/`，不会覆盖目标 fixtures。

桌面和手机布局不同时，在 `sections.json` 里用 `targetSelectors`、`targetHeadings`、`viewports` 或 `absentViewports` 按视口声明提示，不要指望一次标题匹配同时绑对两个视口。需要标题字号这类子节点样式时，给区块加 `styleProbes`。只重抓部分路由时，`--route` 会合并进已有的 `target-capture.json`。详见 `docs/oracle.md`。


参考图只在分析阶段生成或从目标站截取。命令是：

```bash
node tests/parity/visual.mjs --site <site-id> --capture-reference --allow-strict-capture
```

这条命令写完参考图后仍然以失败退出。它不是测量通过。修复循环里禁止再跑它，否则等于用克隆结果覆盖目标。目标站后来改版时，用 `node scripts/compare-target.mjs --site <site-id>` 对比，再 `--accept` 刷新档案，不要在 clone-loop 里重拍。文件名是 `<route>.desktop.png` 和 `<route>.mobile.png`。

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

- 先实现分析里列出的共用组件，再拿它们去拼路由页面。不要先写完整页面再复制页头页脚。
- 页面、样式、客户端交互：`apps/web`。工具链是 Vite+（`vp dev` / `vp build`），配置在 `apps/web/vite.config.ts`。
- HTTP API：`apps/api`。Hono 应用在 `src/app.ts`，Node 启动在 `src/index.ts`。
- 两边都要用的类型和纯函数：`packages/shared`。改完先 `pnpm --filter @replica/shared build`。
- 测量逻辑：`packages/parity` 和 `tests/parity`。不要把某个站点的业务写进这里。

本地同时开：

```bash
pnpm dev:api
pnpm dev:web
```

Web 在 `http://127.0.0.1:5173`，并把 `/api` 和 `/media` 代理到 `http://127.0.0.1:3000`。页面里的静态资源写 `/media/<site-id>/<key>`，由本地媒体服务从 `fixtures/sites/<site-id>/assets/` 提供。目标站的公开数据接口写 `/api/mock/<site-id>/<key>`，由本地 mock 从 `fixtures/sites/<site-id>/api/` 回放。细节见 `docs/media.md` 和 `docs/api-mocks.md`。

Cloudflare 只保留根目录 `wrangler.jsonc` 里的那一个 Worker，入口是 `apps/api/src/worker.ts`。不要加 KV、R2、D1、队列或第二个 Worker。账号和路由写在被 gitignore 的 `wrangler.local.jsonc`，不要写进提交。生产环境再把同一 `/media` 前缀换到 R2，不要把账号 id 写进仓库。

Postgres 和 Redis 不是这个模板的运行时。需要它们的克隆再加驱动，并继续把真实 URL 留在 `.env`。

## 4. 测量，并且只重做失败项

```bash
node scripts/clone-loop.mjs --site <site-id>
```

循环按组件级渐进门禁调度，主要给 AI 用：先过共用组件骨架和页面拼装，再比盒模型与计算样式，通过之后才跑视觉残差，最后才是交互。结构没过时不会跑整页像素比对。报告面向模型的字段是 `status`、`stage`、`next`、`brief`；残差全文在 `temp/clone-loop/<site-id>/report.json`。只修 `next`，不要重做已经通过的路由和区块。

循环会调用：

- 本地 Hono `/api/mock` 健康检查（有抓取的 mock 时；不是 Cloudflare Workers 路由）
- `tests/parity/measure.mjs`：地标、标题、`data-component`、计算样式；结构没过就先不比样式和交互
- `tests/parity/visual.mjs`：仅在更早阶段都过了之后，按档案视口（必须包含桌面 1440 和手机 390）做像素比较。像素图是后证，但 strict 的视觉残差仍挡住 `ready_for_review`

退出码：

| 码  | 含义                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------- |
| 0   | 全部通过                                                                                                          |
| 1   | 分析或陷阱门禁没过，或某一相没有跑完                                                                              |
| 2   | 还有 strict 路由不是 1:1。必须继续修，不能把该路由改成 adapt，也不能给它加 `accepted` 或放宽 `strictMaxDiffRatio` |
| 3   | 只剩 adapt 路由失败。先修；只有 `docs/adapt.md` 允许的那类差异才能写进档案                                        |
| 4   | `--conclude` 后带着残差收工（`failed_with_residuals`），不是通过                                      |

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

模板本身不跑这次克隆。教训先写在实现仓库里，编辑成可复用、不含业务数据的条目之后，再提回公开模板：

```bash
node scripts/promote-experience.mjs
node scripts/promote-experience.mjs --pr
```

默认只预览。`--pr` 会从已设置的 `upstream`（公开模板）拉出分支并打开 PR，只带上 `docs/experience/lessons/` 里的新文件，以及陷阱库中模板还没有的条目。站点 fixtures、参考图、`apps/` 和接口数据都不会进去。站点 id 和目标域名会被改写成通用写法；含密钥的文件会被拒绝。时机是 `clone-loop` 达到 `ready_for_review`，或 `failed_with_residuals` 之后已经写好可复用教训。不要把实现仓库的整棵提交推到模板。

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

## 4b. Oracle 才有权宣布结果

`clone-loop` 不只比较整页。它按阶段指出下一刀该修哪一块，并检查可维护性。详细约定见 `docs/oracle.md`。

- 模型不能凭感觉宣布 1:1。只有 `status` 为 `ready_for_review`（退出码 0）才进入人工审查。
- 先读 `brief` 和 `next`，不要把整份 residuals 塞进上下文。像素分不够过不了；像素很高但源码不可维护，也过不了。
- 每一轮只修 `report.next`。`stuck` 为 true 时停止并跑复盘，不要反复修同一项。
- 还没对齐又必须收工时，用 `--conclude` 留下 `failed_with_residuals` 和证据，不要假装通过。


## 7. 目标站更新后：先对比，再接受，再测差值

文档里说的「更新」如果是指把本模板当 `upstream` 做 `git fetch`，那是同步模板代码，不是目标站改版。目标站增加功能、页面，或布局 / 公开 API 有变化时，走下面这条按需流程（不是定时监控）：

```bash
node scripts/compare-target.mjs --site <site-id>
```

它把公开目标站抓到 `temp/clone-loop/<site-id>/target-update/staging/`，不覆盖现有 fixtures 和参考图，并写出带 `status` / `next` / `residuals` 的报告。看过差值之后再显式接受：

```bash
node scripts/compare-target.mjs --site <site-id> --accept
```

`--accept` 只拷新增和变更的分析档案（baselines、styles、api、assets、structure、sections）。被删掉的路由只出现在报告里，不会自动删除 `apps/web` 里的页面。接受之后，先分析新的共用组件和新页面，再实现（仍然先共用组件、后拼页面），然后用 `clone-loop` 只追变更或失败的路由。

刷新参考图只允许发生在这次接受 / 分析步骤，不能写进修复循环。细节见 `docs/target-update.md`。

## 模板自检


不启动浏览器也可以确认门禁和比较函数：

```bash
pnpm test
```

`fixtures/sites/example` 会走同一套门禁。它的参考图需要本机字体，所以不提交。要看完整的 strict 循环，按 example 的 `analysis/screenshots/README.md` 生成参考图后再跑 `--site example`。
