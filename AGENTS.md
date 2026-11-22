# 给实现克隆的 AI

这个仓库是网站 1:1 克隆的起点。先读 `docs/playbook.md` 和 `docs/adapt.md`，再改代码。方法只有一条，按顺序做，不要用别的产品的实现来填。

## 必须遵守

1. 先分析目标站，把截图、结构、组件、交互和 token 写进 `fixtures/sites/<site-id>/`。分析文件没齐时，不要开始改 `apps/web`。
2. 先读 `docs/experience/traps.md` 和 `docs/experience/lessons/`。把核对写进 `fixtures/sites/<site-id>/traps-checked.md`。不要从记忆或私有仓库补陷阱。
3. 页面放在 `apps/web`（Vite+）。API 放在 `apps/api`（Hono）。共享类型放在 `packages/shared`。测量放在 `packages/parity` 和 `tests/parity`。
4. 用 `node scripts/clone-loop.mjs --site <site-id>` 跑测量和视觉比较。下一轮只处理报告里的失败路由。
5. strict 路由在结构一致且像素差为 0 之前不算完成。不要把失败路由改成 adapt，不要给 strict 加 `accepted`，不要提高 `strictMaxDiffRatio`，不要在修复循环里重拍参考图。
6. 循环退出 0 之后写教训。只有真实失败才追加到陷阱库。
7. 当天用 `node scripts/recap-daily.mjs` 复盘。清理只通过 `--apply-clean`，并且只删标记过的腐烂文件和 `temp/`。

## 不要做

- 不要提交真实密钥、账号、cookie、数据库 URL 或 `.env`。`.env.example` 里的 `DATABASE_URL` 和 `REDIS_URL` 保持占位。API 不要连接它们，除非这个克隆的任务明确要求，并且连接串仍然只来自环境变量。
- 不要复制私有项目的业务代码、商品文案、页面数据或部署配置。example 站点是模板骨架，不是可以拿去冒充的目标站。
- 不要增加第二个 Cloudflare Worker，也不要在 `wrangler.jsonc` 里加 KV、R2、D1、队列、Durable Objects 或账号 id。本地账号写在 `wrangler.local.jsonc`。
- 不要用 npm 或 yarn 安装依赖。这个仓库只用 pnpm。
- 不要把 `temp/` 里的报告或 diff 图提交进 git。
- 私有克隆的 `origin` 是私有仓库。本模板只作为 `upstream`（`https://github.com/monkey-escape/web-replica-template.git`）。更新用 `git fetch upstream`，然后 `git merge upstream/main` 或 `git rebase upstream/main`。不要把私有站点的提交推到这个公开仓库。

## 命令

```bash
pnpm install
cp .env.example .env
pnpm browsers
pnpm --filter @replica/shared build
pnpm dev:api
pnpm dev:web
pnpm test
pnpm build
node scripts/clone-loop.mjs --site <site-id>
node scripts/recap-daily.mjs
```

前端开发命令是 Vite+ 的 `vp`。在仓库根上用 `vp -C apps/web dev`，或 `pnpm dev:web`。库打包用 `vp pack`（`packages/shared`）。不要再引入一套独立的 Vite、Oxlint 或 Oxfmt 配置文件。

## 代码约定

- 标识符和 UI 里属于模板自己的句子用英文。克隆页面上的可见文案跟随目标站语言。
- 注释和仓库里的 Markdown 用中文。
- strict / adapt 的含义以 `docs/adapt.md` 为准。
- 改完共享包后先构建，API 和 Worker 都从 `@replica/shared` 的构建产物解析。

## 做完一条路由的定义

- 档案门禁通过。
- 该路由出现在报告的 `passed` 里，而不是 `failed` 里。
- 若它是 strict，报告来自一次没有 `--capture-reference` 的视觉比较。
