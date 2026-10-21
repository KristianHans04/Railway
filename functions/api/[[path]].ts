import { createApp } from '../../src/server/app'
let app: ReturnType<typeof createApp> | undefined

interface PagesContext {
  request: Request
  env: { SESSION_SECRET: string; APP_ORIGIN?: string }
}

export function onRequest(context: PagesContext): Response | Promise<Response> {
  app ??= createApp({ ...context.env, NODE_ENV: 'production' })
  return app.fetch(context.request)
}
