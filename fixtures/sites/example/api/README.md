# API mocks

example 是模板骨架，不是第三方站点。它只用仓库自己的 `/api/health`，没有需要回放的目标站数据接口。

所以这里的 manifest 写明 `apiMocks: "none"`。真实站点必须二选一：

- 运行 `node scripts/capture-api.mjs --site <site-id>`，把公开 JSON 收到本目录，运行时走 `/api/mock/<site-id>/<key>`；或
- 确认公开页不会打目标站数据接口后，把 `apiMocks` 写成 `"none"`。

不要在运行时热链到目标站 API。不要把密钥或 cookie 写进 fixtures。详见 `docs/api-mocks.md`。
