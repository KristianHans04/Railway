import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp } from '../src/server/app'

const app = createApp({ SESSION_SECRET: process.env.SESSION_SECRET ?? '', APP_ORIGIN: process.env.APP_ORIGIN, NODE_ENV: process.env.NODE_ENV })
app.use('/*', serveStatic({ root: './dist' }))
app.get('/', serveStatic({ path: './dist/index.html' }))
app.get('*', serveStatic({ path: './dist/index.html' }))

const server = serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), hostname: '0.0.0.0' })
process.on('SIGTERM', () => server.close())
process.on('SIGINT', () => server.close())
