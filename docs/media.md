# 本地媒体服务（R2 占位）

开发和生产使用同一套公开地址：`/media/<site-id>/<key>`。对象键稳定，页面里不要写目标站的原始域名。

## 开发环境

Node 入口（`apps/api/src/index.ts`）挂载 `GET /media/:siteId/*`，从 `fixtures/sites/<site-id>/assets/` 读文件。默认根目录是仓库里的 `fixtures/sites`，也可以用环境变量 `MEDIA_ASSETS_ROOT` 改掉。不要在仓库里放 Cloudflare 账号 id 或密钥。

Vite 开发服务器把 `/media` 和 `/api` 一起代理到本地 API（默认 `http://127.0.0.1:3000`）。页面里直接写 `/media/<site-id>/<key>` 即可。

支持常见图片、字体、视频的 `Content-Type`，视频请求可以带 `Range`，返回 206。路径会做校验，拒绝 `..` 和逃出站点资源目录的符号链接。

这个路由只挂在 Node 入口上。Worker 入口（`apps/api/src/worker.ts`）不读本地文件系统，也不在这里声明 R2 绑定。模板始终只有一个 Worker。

## 生产环境

之后把同一前缀 `/media/<site-id>/<key>` 换到 R2，对象键不变。bucket 名、账号 id 和密钥只写在被 gitignore 的 `wrangler.local.jsonc`，不要写进 `wrangler.jsonc` 或源码。

## 分析阶段就要收下资源

不要在运行时热链到目标站。分析阶段必须：

1. 在 `fixtures/sites/<site-id>/assets/manifest.json` 列出需要的公开图片、字体和视频。
2. 运行 `node scripts/capture-assets.mjs --site <site-id>`，把文件下到 `fixtures/sites/<site-id>/assets/`。
3. 在 `assets/README.md` 记录来源和对应的 `/media/...` 地址。
4. 实现页面时把运行时 URL 改成 `/media/<site-id>/<key>`。

只收公开资源。不要登录，不要抓需要鉴权的接口或私有页面。

## 怎么跑

```bash
pnpm dev:api
pnpm dev:web
node scripts/capture-assets.mjs --site <site-id>
```

example 站点可以自检：

```bash
node scripts/capture-assets.mjs --self-test
```

访问示例：`http://127.0.0.1:5173/media/example/mark.svg`（经 Vite 代理）或 `http://127.0.0.1:3000/media/example/mark.svg`（直连 API）。

公开 JSON 接口走另一套平行约定：`/api/mock/<site-id>/<key>`，fixtures 在 `fixtures/sites/<site-id>/api/`。详见 `docs/api-mocks.md`。不要在运行时热链到目标站 API。
