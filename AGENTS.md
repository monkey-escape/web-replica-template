# 给实现克隆的 AI

这个仓库是网站 1:1 克隆的起点。先读 `docs/playbook.md` 和 `docs/adapt.md`，再改代码。方法只有一条，按顺序做，不要用别的产品的实现来填。

## 必须遵守

1. 先分析目标站，把截图、结构、组件、交互和 token 写进 `fixtures/sites/<site-id>/`。分析阶段必须下载公开图片、字体和视频到 `fixtures/sites/<site-id>/assets/`，并把运行时地址改成 `/media/<site-id>/<key>`。公开数据接口同样要收下 fixtures，运行时走 `/api/mock/<site-id>/<key>`；若公开站没有数据接口，在 `api/manifest.json` 写明 `apiMocks: "none"`。不要在运行时热链到目标站或其 API。`analysis/components.md` 必须分清共用组件和页面专用块，并写明每个共用组件出现的路由（没有共用块时写 `shared-components: none`）。分析文件、`assets/README.md` 和 API mock 决定没齐、共用组件还没识别完时，不要开始改 `apps/web`，更不要先写路由页面。实现顺序是：先做共用组件，再拼页面。
2. 先读 `docs/experience/traps.md` 和 `docs/experience/lessons/`。把核对写进 `fixtures/sites/<site-id>/traps-checked.md`。不要从记忆或私有仓库补陷阱。
3. 页面放在 `apps/web`（Vite+）。API 放在 `apps/api`（Hono）。共享类型放在 `packages/shared`。测量放在 `packages/parity` 和 `tests/parity`。本地媒体和 API mock 的约定见 `docs/media.md` 和 `docs/api-mocks.md`。
4. 分析阶段用 `node scripts/capture-sections.mjs --site <site-id> --from-target` 把目标站公开页的几何框和计算样式写入 `fixtures/sites/<site-id>/styles/`（不要登录，不要请求 `/api/` 或 `/requisition`）。桌面和手机布局不同时，在 `sections.json` 里写视口专属提示（`targetSelectors` / `viewports` / `absentViewports`）；标题字号用 `styleProbes`。`--route` 会合并进已有摘要。然后用 `node scripts/clone-loop.mjs --site <site-id>` 跑 Oracle 循环。循环按组件级渐进门禁调度（共用组件骨架 → 页面拼装 → 盒模型与计算样式 → 视觉残差 → 交互），主要给 AI 用：只修 `next`，先读 `brief`。档案必须包含桌面宽度 1440 和手机宽度 390。脚本才是裁定，不要自行宣布完成。同一条 `next` 连续失败被标 `stuck` 时停止并复盘。
5. strict 路由在结构一致、像素对齐、源码可维护之前不算完成。像素分不够或源码不可维护都是失败。不要把失败路由改成 adapt，不要给 strict 加 `accepted`，不要提高 `strictMaxDiffRatio`，不要在修复循环里重拍参考图。目标站改版时，先跑 `node scripts/compare-target.mjs --site <site-id>`，分析差值（含新的共用组件和新页面）后再改 `apps/web`，显式 `--accept` 才允许刷新 fixtures / 参考图；实现顺序仍是先共用组件、再拼页面，然后用 clone-loop 只追变更或失败的路由。这和把本模板当 `upstream` 做 `git fetch` 不是同一件事。决策写在 `.agents/notes/`，不要把长文塞进本文件。
6. 循环退出 0 之后写教训。只有真实失败才追加到陷阱库。编辑成可复用、不含业务数据的条目后，用 `node scripts/promote-experience.mjs` 预览，再用 `--pr` 向模板 `upstream` 打开只含经验库的 PR。不要把实现仓库的站点页面、fixtures 或参考图推到公开模板。
7. 当天用 `node scripts/recap-daily.mjs` 复盘。清理只通过 `--apply-clean`，并且只删标记过的腐烂文件和 `temp/`。

## 不要做

- 不要提交真实密钥、账号、cookie、数据库 URL 或 `.env`。`.env.example` 里的 `DATABASE_URL` 和 `REDIS_URL` 保持占位。API 不要连接它们，除非这个克隆的任务明确要求，并且连接串仍然只来自环境变量。
- 不要复制私有项目的业务代码、商品文案、页面数据或部署配置。example 站点是模板骨架，不是可以拿去冒充的目标站。
- 不要增加第二个 Cloudflare Worker，也不要在 `wrangler.jsonc` 里加 KV、R2、D1、队列、Durable Objects 或账号 id。本地账号写在 `wrangler.local.jsonc`。生产环境再把 `/media` 换到 R2，密钥不要进仓库。
- 不要把 CSS 转成 UnoCSS，也不要为了减小体积改模板的样式方案。等 1:1 完成后再评估。
- 不要用 npm 或 yarn 安装依赖。这个仓库只用 pnpm。
- 不要把 `temp/` 里的报告或 diff 图提交进 git。
- 私有克隆的 `origin` 是私有仓库。本模板只作为 `upstream`（`https://github.com/monkey-escape/web-replica-template.git`）。更新用 `git fetch upstream`，然后 `git merge upstream/main` 或 `git rebase upstream/main`。不要把私有站点的提交推到这个公开仓库。
- 用 DeepSeek Harness 时，把 `harness/dsh-web-replica` 加进 profile：`dsh plugin --profile <profile> add ./harness/dsh-web-replica`，然后选 preset **1:1 website replica**（id `web-replica`）。persona、skills 和 `replica_*` 工具都指向本仓库的 playbook 与脚本，不要在 Harness 里另写一套方法，也不要复制或 fork Harness 仓库。bash / fs / web 仍然可用。不要安装 Cursor 市场里的无关插件 8006。

## 命令

```bash
pnpm install
cp .env.example .env
pnpm browsers
pnpm --filter @replica/shared build
pnpm dev:api
pnpm dev:web
node scripts/capture-assets.mjs --site <site-id>
node scripts/capture-api.mjs --site <site-id>
pnpm test
pnpm build
node scripts/check-gates.mjs --site <site-id>
node scripts/compare-target.mjs --site <site-id>
node scripts/compare-target.mjs --site <site-id> --accept
node scripts/clone-loop.mjs --site <site-id>
node scripts/clone-loop.mjs --site <site-id> --write-lesson --slug <slug>
node scripts/promote-experience.mjs
node scripts/promote-experience.mjs --pr
node scripts/recap-daily.mjs
```

前端开发命令是 Vite+ 的 `vp`。在仓库根上用 `vp -C apps/web dev`，或 `pnpm dev:web`。库打包用 `vp pack`（`packages/shared`）。不要再引入一套独立的 Vite、Oxlint 或 Oxfmt 配置文件。

## 代码约定

- 标识符和 UI 里属于模板自己的句子用英文。克隆页面上的可见文案跟随目标站语言。
- 注释和仓库里的 Markdown 用中文。
- strict / adapt 的含义以 `docs/adapt.md` 为准。
- 改完共享包后先构建，API 和 Worker 都从 `@replica/shared` 的构建产物解析。

## 做完的定义

- 档案门禁通过。
- `clone-loop` 的 `status` 是 `ready_for_review`（退出码 0），或诚实收工为 `failed_with_residuals`（退出码 4）。
- 源码分段可读、token 共享、运行时走 `/media` 和 `/api/mock`（或已记录 `apiMocks: "none"`），不是一整页生成文件。
- 若路由是 strict，报告来自一次没有 `--capture-reference` 的比较。
