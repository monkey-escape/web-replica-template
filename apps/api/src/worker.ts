import app from './app.js'

// 唯一的 Worker 入口。不要在这里加绑定或平台专用 SDK，也不要读本地文件系统。
// 本地 /media 和 /api/mock 路由只挂在 Node 入口上，分别从
// fixtures/sites/<site-id>/assets/ 和 fixtures/sites/<site-id>/api/ 读文件。
// 生产环境把同一 URL 前缀 /media/<site-id>/<key> 指到 R2；/api/mock/<site-id>/<key>
// 以后若要上线，再用 Worker 配置里的存储回放同一对象键。不要把账号 id 或密钥写进本文件。
export default app
