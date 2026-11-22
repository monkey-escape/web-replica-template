import { serve } from '@hono/node-server'
import app from './app.js'
import { loadLocalEnv } from './env.js'

loadLocalEnv()

const port = Number(process.env.PORT ?? 3000)

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`API listening on http://127.0.0.1:${info.port}`)
  },
)
