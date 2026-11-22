# 本地 API mock（公开接口回放）

开发和以后的运行时使用同一套公开地址：`/api/mock/<site-id>/<key>`。对象键来自 manifest，页面里不要写目标站的原始 API 域名。

这和 `/media/<site-id>/<key>` 是同一类约定：分析阶段把公开响应收进 fixtures，克隆只回放本地副本。

## 开发环境

Node 入口（`apps/api/src/index.ts`）挂载 `GET /api/mock/:siteId/*`，从 `fixtures/sites/<site-id>/api/` 读 JSON 文件。默认根目录是仓库里的 `fixtures/sites`，也可以用环境变量 `API_MOCKS_ROOT` 改掉。不要在仓库里放 Cloudflare 账号 id 或密钥。

Vite 开发服务器已经把 `/api` 代理到本地 API（默认 `http://127.0.0.1:3000`），所以页面里直接写 `/api/mock/<site-id>/<key>` 即可，不必再改 `vite.config.ts`。

回放时使用 manifest 里的 `status` 和 `content-type`。不回放 `Set-Cookie` 或鉴权头。路径会做校验，拒绝 `..` 和逃出站点 `api/` 目录的符号链接。

这个路由只挂在 Node 入口上。Worker 入口（`apps/api/src/worker.ts`）不读本地文件系统，也不在这里声明 KV / R2 / D1 绑定。以后若要在生产环境回放同一前缀，再用 Worker 配置里的存储，对象键保持不变；不要把账号 id 或密钥写进源码。

## 分析阶段必须先做决定

分析在这件事上不算完成，必须二选一：

1. 运行 `node scripts/capture-api.mjs --site <site-id>`，把公开页自己发出的 JSON/XHR/fetch 收到 `fixtures/sites/<site-id>/api/`，并把运行时地址改成 `/api/mock/<site-id>/<key>`；或
2. 确认公开页不会打目标站数据接口后，在 `fixtures/sites/<site-id>/api/manifest.json` 里写明 `apiMocks: "none"`。

`apiMocks: "pending"` 或缺少 manifest 都会让档案门禁失败。不要在运行时热链到目标站 API。

## 怎么抓

脚本只在加载公开页面时被动监听网络，不会自己发明或手动去打接口，也不会把浏览器导航到 `/api/` 或 `/requisition`。年龄门可以关掉。不要登录，不要提交表单，不要抓写操作。

```bash
node scripts/capture-api.mjs --site <site-id>
node scripts/capture-api.mjs --site <site-id> --target https://www.example.com --route home
```

会跳过这些响应：登录墙、`/requisition`、POST/PUT/PATCH/DELETE、带 `Set-Cookie` / `Authorization` 等凭证头、HTML 文档、已经由 `/media` 处理的图片字体视频、追踪脚本，以及看起来像密钥的响应体（会记入 manifest 的 `skipped`，不写进 fixtures）。

对象键形如 `get/api-catalog`（带查询串时再加短哈希）。example 站点是模板骨架，只用仓库自己的 `/api/health`，所以它的 manifest 写明 `apiMocks: "none"`，不要往 example 里塞伪装的第三方接口数据。

自检：

```bash
node scripts/capture-api.mjs --self-test
```

访问示例（模板默认端口）：`http://127.0.0.1:5173/api/mock/<site-id>/<key>`（经 Vite 代理）或 `http://127.0.0.1:3000/api/mock/<site-id>/<key>`（直连 API）。具体端口以 `apps/web/vite.config.ts` 和 `PORT` 为准。
