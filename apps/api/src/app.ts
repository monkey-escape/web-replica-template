import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serviceHealth } from '@replica/shared'

const app = new Hono()

// 本地 CORS。Worker 上没有 Node 的 process 时退回默认来源。
function readWebOrigin(): string {
  const env = globalThis.process?.env?.WEB_ORIGIN
  return env && env.length > 0 ? env : 'http://127.0.0.1:5173'
}

app.use(
  '*',
  cors({
    origin: (origin) => {
      const allowed = readWebOrigin()
      if (!origin) return allowed
      return origin === allowed ? origin : null
    },
  }),
)

app.get('/', (c) => {
  return c.text('Replica API')
})

// storage 固定为 unconfigured：DATABASE_URL / REDIS_URL 只是占位，这里不连接。
app.get('/api/health', (c) => {
  return c.json(serviceHealth())
})

export default app
