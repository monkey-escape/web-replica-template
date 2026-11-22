import { serve } from '@hono/node-server'
import app from './app.js'
import { loadLocalEnv } from './env.js'
import { mountLocalApiMocks } from './api-mocks.js'
import { mountLocalMedia } from './media.js'

loadLocalEnv()
mountLocalMedia(app)
mountLocalApiMocks(app)


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
