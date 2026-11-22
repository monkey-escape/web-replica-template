# 交互

## ping-api

- 路由：`/`
- 触发：点击 `[data-interaction="ping-api"]`
- 请求：`GET /api/health`
- 成功：`#api-status` 的文本包含 `API ok`
- 失败：文本变为 `API unreachable`。strict 路由不会把失败当成通过。

这个请求走 Vite 的 `/api` 代理，所以测量前要同时开着 web 和 API。

## back-home

- 路由：`/about/`
- 触发：链接 `[data-interaction="back-home"]`
- 结果：回到 `/`
- 不请求 API，也不改变关于页的结构。
