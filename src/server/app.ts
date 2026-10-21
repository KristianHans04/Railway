import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { connectSchema, createSchema, idSchema, lifecycle, type Project } from '../shared/domain'
import { openSession, sealSession, SESSION_SECONDS, type Session } from './session'
import { RailwayClient, RailwayError } from './railway'

export type AppConfig = { SESSION_SECRET: string; APP_ORIGIN?: string; NODE_ENV?: string }
export type ClientFactory = (session: Session, report: (event: { operation: string; durationMs: number; outcome: string; traceId?: string; failureType?: string }) => void) => RailwayClient
const defaultFactory: ClientFactory = (session, report) => new RailwayClient(session, (input, init) => fetch(input, init), report)
const id = () => crypto.randomUUID()

export function createApp(config: AppConfig, clientFactory: ClientFactory = defaultFactory) {
  if (!config.SESSION_SECRET) throw new Error('SESSION_SECRET is required')
  const app = new Hono()
  const secure = config.NODE_ENV === 'production'
  const requests = new Map<string, { count: number; reset: number }>()
  const projectCache = new Map<string, { value: Project; expires: number }>()
  async function projectKey(token: string, projectId: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${token}:${projectId}`)))
    return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
  }

  app.use('*', async (c, next) => {
    const requestId = id()
    const started = Date.now()
    c.header('X-Request-ID', requestId)
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-Frame-Options', 'DENY')
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'")
    try { await next() }
    finally { console.info(JSON.stringify({ requestId, route: c.req.path, method: c.req.method, status: c.res.status, durationMs: Date.now() - started })) }
  })

  app.onError((error, c) => {
    const known = error instanceof RailwayError
    const status = known ? ({ auth: 401, permission: 403, validation: 400, rate_limit: 429, temporary: 503, uncertain: 409, upstream: 502 } as const)[error.kind] : error instanceof z.ZodError ? 400 : 500
    if (!known && !(error instanceof z.ZodError)) console.error(JSON.stringify({ route: c.req.path, class: error.constructor.name }))
    return c.json({ error: known ? error.message : error instanceof z.ZodError ? 'Check the submitted fields.' : 'The application could not complete this request.', kind: known ? error.kind : status === 400 ? 'validation' : 'application', ...(known && error.traceId ? { traceId: error.traceId } : {}), ...(known && error.retryAfter ? { retryAfter: error.retryAfter } : {}) }, status)
  })

  const client = (session: Session) => clientFactory(session, event => console.info(JSON.stringify({ railwayOperation: event.operation, durationMs: event.durationMs, outcome: event.outcome, ...(event.traceId ? { traceId: event.traceId } : {}), ...(event.failureType ? { failureType: event.failureType } : {}) })))
  async function session(c: { req: { raw: Request } }): Promise<Session> {
    const cookie = c.req.raw.headers.get('cookie')?.split('; ').find(piece => piece.startsWith('lc_session='))?.slice(11)
    const value = await openSession(cookie, config.SESSION_SECRET)
    if (!value) throw new RailwayError('auth', 'Connect Railway to continue.')
    return value
  }
  async function authorizedProject(s: Session, projectId: string): Promise<Project> {
    if (s.type === 'project' && s.projectId !== projectId) throw new RailwayError('permission', 'This project token does not have access to that project.')
    const cacheKey = await projectKey(s.token, projectId)
    const cached = projectCache.get(cacheKey)
    if (cached && cached.expires > Date.now()) return cached.value
    const project = await client(s).project(projectId)
    projectCache.set(cacheKey, { value: project, expires: Date.now() + 5 * 60 * 1000 })
    if (projectCache.size > 1000) for (const [key, entry] of projectCache) if (entry.expires < Date.now()) projectCache.delete(key)
    return project
  }
  async function scoped(c: { req: { raw: Request } }, projectId: string, environmentId: string, serviceId?: string) {
    const s = await session(c)
    if (s.type === 'project' && s.environmentId !== environmentId) throw new RailwayError('permission', 'This project token does not have access to that environment.')
    const project = await authorizedProject(s, projectId)
    if (!project.environments.some(env => env.id === environmentId)) throw new RailwayError('permission', 'Environment is outside the selected project.')
    if (serviceId && !project.services.some(service => service.id === serviceId)) throw new RailwayError('permission', 'Service is outside the selected project.')
    return { s, project }
  }
  async function jsonBody(c: { req: { raw: Request } }): Promise<unknown> {
    const length = Number(c.req.raw.headers.get('content-length') ?? 0)
    if (length > 8192) throw new RailwayError('validation', 'Request body is too large.')
    const body = await c.req.raw.text()
    if (body.length > 8192) throw new RailwayError('validation', 'Request body is too large.')
    try { return JSON.parse(body) as unknown }
    catch { throw new RailwayError('validation', 'Request body must be valid JSON.') }
  }

  app.use('/api/*', async (c, next) => {
    const source = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
    const key = `${source}:api`
    const now = Date.now()
    const entry = requests.get(key)
    if (entry && entry.reset > now && entry.count >= 100) return c.json({ error: 'Too many requests. Wait before trying again.', kind: 'rate_limit' }, 429)
    requests.set(key, entry && entry.reset > now ? { ...entry, count: entry.count + 1 } : { count: 1, reset: now + 3600000 })
    if (c.req.path === '/api/connect') {
      const connectKey = `${source}:connect`
      const connectEntry = requests.get(connectKey)
      if (connectEntry && connectEntry.reset > now && connectEntry.count >= 5) return c.json({ error: 'Too many connection attempts. Wait one minute.', kind: 'rate_limit' }, 429)
      requests.set(connectKey, connectEntry && connectEntry.reset > now ? { ...connectEntry, count: connectEntry.count + 1 } : { count: 1, reset: now + 60000 })
    }
    if (requests.size > 10000) for (const [item, value] of requests) if (value.reset < now) requests.delete(item)
    if (c.req.method !== 'GET') {
      const origin = c.req.header('origin')
      const expected = config.APP_ORIGIN ?? (secure ? new URL(c.req.url).origin : 'http://localhost:5173')
      if (origin !== expected) return c.json({ error: 'Request origin was rejected.', kind: 'validation' }, 403)
      if (c.req.header('x-csrf-token') !== getCookie(c, 'lc_csrf') || !getCookie(c, 'lc_csrf')) return c.json({ error: 'Session check failed. Refresh the page.', kind: 'validation' }, 403)
    }
    await next()
  })

  app.get('/api/health', c => c.json({ ok: true }))
  app.get('/api/session', async c => {
    if (!getCookie(c, 'lc_csrf')) setCookie(c, 'lc_csrf', id(), { path: '/', sameSite: 'Strict', secure, maxAge: SESSION_SECONDS })
    const s = await openSession(getCookie(c, 'lc_session'), config.SESSION_SECRET)
    return c.json(s ? { connected: true, type: s.type, projectId: s.projectId, environmentId: s.environmentId } : { connected: false })
  })
  app.post('/api/connect', async c => {
    const input = connectSchema.parse(await jsonBody(c))
    const provisional: Session = { v: 1, type: input.type, token: input.token, expires: Date.now() + SESSION_SECONDS * 1000 }
    const scope = await client(provisional).validate()
    const s = { ...provisional, ...scope }
    setCookie(c, 'lc_session', await sealSession(s, config.SESSION_SECRET), { path: '/', httpOnly: true, sameSite: 'Strict', secure, maxAge: SESSION_SECONDS })
    return c.json({ connected: true, type: s.type, projectId: s.projectId, environmentId: s.environmentId })
  })
  app.post('/api/disconnect', c => { deleteCookie(c, 'lc_session', { path: '/' }); return c.json({ connected: false }) })
  app.get('/api/projects', async c => {
    const s = await session(c)
    if (s.type === 'project') {
      const project = await authorizedProject(s, s.projectId!)
      return c.json({ projects: [{ id: project.id, name: project.name }] })
    }
    return c.json({ projects: await client(s).listProjects() })
  })
  app.get('/api/projects/:projectId', async c => {
    const projectId = idSchema.parse(c.req.param('projectId'))
    const s = await session(c)
    const project = await authorizedProject(s, projectId)
    return c.json({ project: s.type === 'project' ? { ...project, environments: project.environments.filter(env => env.id === s.environmentId) } : project })
  })
  app.post('/api/services', async c => {
    const input = createSchema.parse(await jsonBody(c))
    const { s } = await scoped(c, input.projectId, input.environmentId)
    const name = input.name ?? `container-${crypto.randomUUID().slice(0, 8)}`
    const service = await client(s).create(input.projectId, input.environmentId, name, input.image)
    projectCache.delete(await projectKey(s.token, input.projectId))
    return c.json({ service, image: input.image, projectId: input.projectId, environmentId: input.environmentId }, 201)
  })
  app.get('/api/services/:serviceId/deployments', async c => {
    const serviceId = idSchema.parse(c.req.param('serviceId'))
    const projectId = idSchema.parse(c.req.query('projectId'))
    const environmentId = idSchema.parse(c.req.query('environmentId'))
    const { s } = await scoped(c, projectId, environmentId, serviceId)
    return c.json({ deployments: await client(s).deployments(projectId, environmentId, serviceId) })
  })
  app.post('/api/services/:serviceId/deploy', async c => {
    const serviceId = idSchema.parse(c.req.param('serviceId'))
    const input = z.object({ projectId: idSchema, environmentId: idSchema }).strict().parse(await jsonBody(c))
    const { s } = await scoped(c, input.projectId, input.environmentId, serviceId)
    const existing = await client(s).deployments(input.projectId, input.environmentId, serviceId)
    if (existing.some(item => lifecycle(item.status).poll || lifecycle(item.status).phase === 'running')) throw new RailwayError('validation', 'A deployment already exists in this environment. Refresh its state.')
    const deploymentId = await client(s).deploy(serviceId, input.environmentId)
    return c.json({ deploymentId }, 202)
  })
  app.get('/api/deployments/:deploymentId', async c => {
    const deploymentId = idSchema.parse(c.req.param('deploymentId'))
    const projectId = idSchema.parse(c.req.query('projectId'))
    const environmentId = idSchema.parse(c.req.query('environmentId'))
    const serviceId = idSchema.parse(c.req.query('serviceId'))
    const { s } = await scoped(c, projectId, environmentId, serviceId)
    const deployments = await client(s).deployments(projectId, environmentId, serviceId)
    if (!deployments.some(item => item.id === deploymentId)) throw new RailwayError('permission', 'Deployment is outside the selected service.')
    return c.json({ deployment: await client(s).deployment(deploymentId) })
  })
  app.get('/api/deployments/:deploymentId/logs', async c => {
    const deploymentId = idSchema.parse(c.req.param('deploymentId'))
    const projectId = idSchema.parse(c.req.query('projectId'))
    const environmentId = idSchema.parse(c.req.query('environmentId'))
    const serviceId = idSchema.parse(c.req.query('serviceId'))
    const type = z.enum(['build', 'runtime']).parse(c.req.query('type'))
    const since = c.req.query('since') ? z.iso.datetime().parse(c.req.query('since')) : undefined
    const { s } = await scoped(c, projectId, environmentId, serviceId)
    const deployments = await client(s).deployments(projectId, environmentId, serviceId)
    if (!deployments.some(item => item.id === deploymentId)) throw new RailwayError('permission', 'Deployment is outside the selected service.')
    return c.json({ lines: await client(s).logs(deploymentId, type, since) })
  })
  app.post('/api/deployments/:deploymentId/:action', async c => {
    const deploymentId = idSchema.parse(c.req.param('deploymentId'))
    const action = z.enum(['stop', 'restart']).parse(c.req.param('action'))
    const input = z.object({ projectId: idSchema, environmentId: idSchema, serviceId: idSchema }).strict().parse(await jsonBody(c))
    const { s } = await scoped(c, input.projectId, input.environmentId, input.serviceId)
    const deployments = await client(s).deployments(input.projectId, input.environmentId, input.serviceId)
    if (!deployments.some(item => item.id === deploymentId)) throw new RailwayError('permission', 'Deployment is outside the selected service.')
    const current = await client(s).deployment(deploymentId)
    const state = lifecycle(current.status)
    if (action === 'stop' && !state.stop || action === 'restart' && !state.restart) throw new RailwayError('validation', `Cannot ${action} a deployment in state ${current.status}.`)
    if (action === 'stop') await client(s).stop(deploymentId)
    else await client(s).restart(deploymentId)
    return c.json({ accepted: true })
  })
  app.post('/api/services/:serviceId/delete', async c => {
    const serviceId = idSchema.parse(c.req.param('serviceId'))
    const input = z.object({ projectId: idSchema, environmentId: idSchema, confirmName: z.string() }).strict().parse(await jsonBody(c))
    const { s, project } = await scoped(c, input.projectId, input.environmentId, serviceId)
    const service = project.services.find(item => item.id === serviceId)
    if (service?.name !== input.confirmName) throw new RailwayError('validation', 'Type the exact service name to delete it.')
    await client(s).delete(serviceId)
    projectCache.delete(await projectKey(s.token, input.projectId))
    return c.json({ deleted: true })
  })
  return app
}
