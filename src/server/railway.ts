import { z } from 'zod'
import type { Deployment, LogLine, Project, Service } from '../shared/domain'
import type { Session } from './session'

export type Operation = keyof typeof documents
const documents = {
  ProjectToken: 'query ProjectToken { projectToken { projectId environmentId } }',
  Projects: 'query Projects { projects { edges { node { id name } } } }',
  Project: 'query Project($id: String!) { project(id: $id) { id name environments { edges { node { id name } } } services { edges { node { id name } } } } }',
  ServiceCreate: 'mutation ServiceCreate($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }',
  ServiceDeploy: 'mutation ServiceDeploy($serviceId: String!, $environmentId: String!) { serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId) }',
  Deployments: 'query Deployments($input: DeploymentListInput!, $first: Int) { deployments(input: $input, first: $first) { edges { node { id status createdAt } } } }',
  Deployment: 'query Deployment($id: String!) { deployment(id: $id) { id status createdAt meta } }',
  BuildLogs: 'query BuildLogs($deploymentId: String!, $limit: Int) { buildLogs(deploymentId: $deploymentId, limit: $limit) { timestamp message severity } }',
  DeploymentLogs: 'query DeploymentLogs($deploymentId: String!, $limit: Int, $startDate: DateTime) { deploymentLogs(deploymentId: $deploymentId, limit: $limit, startDate: $startDate) { timestamp message severity } }',
  DeploymentStop: 'mutation DeploymentStop($id: String!) { deploymentStop(id: $id) }',
  DeploymentRestart: 'mutation DeploymentRestart($id: String!) { deploymentRestart(id: $id) }',
  ServiceDelete: 'mutation ServiceDelete($id: String!) { serviceDelete(id: $id) }',
} as const

const graphqlEnvelope = z.object({
  data: z.record(z.string(), z.unknown()).nullable().optional(),
  errors: z.array(z.object({ message: z.string(), extensions: z.object({ code: z.string().optional(), traceId: z.string().optional() }).optional() })).optional(),
})

export class RailwayError extends Error {
  constructor(public kind: 'auth' | 'permission' | 'validation' | 'rate_limit' | 'temporary' | 'uncertain' | 'upstream', message: string, public traceId?: string, public retryAfter?: number) { super(message) }
}

export function retryAfterSeconds(header: string | null): number | undefined {
  if (!header) return undefined
  const numeric = Number(header)
  if (Number.isFinite(numeric)) return Math.max(0, Math.min(3600, numeric))
  const date = Date.parse(header)
  return Number.isFinite(date) ? Math.max(0, Math.min(3600, Math.ceil((date - Date.now()) / 1000))) : undefined
}

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason); return }
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
})

function classify(status: number, message: string, code?: string, traceId?: string, retryAfter?: number): RailwayError {
  if (status === 401 || /unauthenticated|invalid token|token.*expired|project token not found/i.test(message)) return new RailwayError('auth', 'Railway rejected this credential. Reconnect with a valid token.', traceId)
  if (status === 403 || /not authorized|forbidden|permission/i.test(message)) return new RailwayError('permission', 'This token does not have permission for that Railway resource.', traceId)
  if (status === 429) return new RailwayError('rate_limit', 'Railway rate limit reached. Wait before retrying.', traceId, retryAfter)
  if (status >= 500 || code === 'INTERNAL_SERVER_ERROR') return new RailwayError('temporary', 'Railway returned a temporary error. Refresh the resource state before trying again.', traceId)
  if (status === 400 || code === 'BAD_USER_INPUT' || code === 'GRAPHQL_VALIDATION_FAILED') return new RailwayError('validation', 'Railway rejected the request. Check the image and selected context.', traceId)
  return new RailwayError('upstream', 'Railway could not complete the request.', traceId)
}

export class RailwayClient {
  constructor(private session: Pick<Session, 'type' | 'token'>, private fetcher: typeof fetch = (input, init) => fetch(input, init), private report?: (event: { operation: Operation; durationMs: number; outcome: string; traceId?: string; failureType?: string }) => void) {}

  async execute(operation: Operation, variables: Record<string, unknown> = {}, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const mutation = operation === 'ServiceCreate' || operation === 'ServiceDeploy' || operation === 'DeploymentStop' || operation === 'DeploymentRestart' || operation === 'ServiceDelete'
    for (let attempt = 0; attempt < (mutation ? 1 : 3); attempt++) {
      const started = Date.now()
      let response: Response
      const controller = new AbortController()
      const abort = () => controller.abort(signal?.reason)
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
      const timeout = setTimeout(() => controller.abort(), 12000)
      try {
        response = await this.fetcher('https://backboard.railway.com/graphql/v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(this.session.type === 'project' ? { 'Project-Access-Token': this.session.token } : { Authorization: `Bearer ${this.session.token}` }) },
          body: JSON.stringify({ query: documents[operation], variables, operationName: operation }),
          signal: controller.signal,
        })
      } catch (error) {
        this.report?.({ operation, durationMs: Date.now() - started, outcome: 'network', failureType: error instanceof Error ? error.name : 'unknown' })
        if (mutation) throw new RailwayError('uncertain', 'Railway may have processed the action. Refresh its state before trying again.')
        if (attempt === 2 || signal?.aborted) throw new RailwayError('temporary', 'Could not reach Railway. Try refreshing in a moment.')
        await wait(300 * 2 ** attempt + Math.random() * 200, signal)
        continue
      } finally {
        clearTimeout(timeout)
        signal?.removeEventListener('abort', abort)
      }
      let payload: z.infer<typeof graphqlEnvelope>
      try { payload = graphqlEnvelope.parse(await response.json()) }
      catch {
        this.report?.({ operation, durationMs: Date.now() - started, outcome: 'malformed' })
        if (mutation) throw new RailwayError('uncertain', 'Railway returned an unreadable response. Refresh its state before trying again.')
        throw new RailwayError('upstream', 'Railway returned an unreadable response.')
      }
      const firstError = payload.errors?.[0]
      if (!response.ok || firstError) {
        const error = classify(response.status, firstError?.message ?? 'HTTP error', firstError?.extensions?.code, firstError?.extensions?.traceId, retryAfterSeconds(response.headers.get('Retry-After')))
        this.report?.({ operation, durationMs: Date.now() - started, outcome: error.kind, traceId: error.traceId })
        if (!mutation && attempt < 2 && (error.kind === 'temporary' || error.kind === 'rate_limit')) {
          await wait((error.retryAfter ?? (0.4 * 2 ** attempt + Math.random() * 0.2)) * 1000, signal)
          continue
        }
        throw error
      }
      this.report?.({ operation, durationMs: Date.now() - started, outcome: 'ok' })
      if (!payload.data) throw new RailwayError('upstream', 'Railway returned no resource data.')
      return payload.data
    }
    throw new RailwayError('temporary', 'Railway did not respond after several attempts.')
  }

  async validate(): Promise<{ projectId?: string; environmentId?: string }> {
    if (this.session.type === 'project') {
      const data = await this.execute('ProjectToken')
      return z.object({ projectId: z.string().uuid(), environmentId: z.string().uuid() }).parse(data.projectToken)
    }
    await this.execute('Projects')
    return {}
  }
  async listProjects(): Promise<{ id: string; name: string }[]> {
    const data = await this.execute('Projects')
    return connection(z.object({ id: z.string(), name: z.string() })).parse(data.projects).edges.map(edge => edge.node)
  }
  async project(id: string): Promise<Project> {
    const data = await this.execute('Project', { id })
    const project = z.object({
      id: z.string(), name: z.string(),
      environments: connection(z.object({ id: z.string(), name: z.string() })),
      services: connection(z.object({ id: z.string(), name: z.string() })),
    }).parse(data.project)
    return { id: project.id, name: project.name, environments: project.environments.edges.map(edge => edge.node), services: project.services.edges.map(edge => edge.node) }
  }
  async create(projectId: string, environmentId: string, name: string, image: string): Promise<Service> {
    const data = await this.execute('ServiceCreate', { input: { projectId, environmentId, name, source: { image } } })
    return z.object({ id: z.string(), name: z.string() }).parse(data.serviceCreate)
  }
  async deploy(serviceId: string, environmentId: string): Promise<string> {
    const data = await this.execute('ServiceDeploy', { serviceId, environmentId })
    return z.string().parse(data.serviceInstanceDeployV2)
  }
  async deployments(projectId: string, environmentId: string, serviceId: string): Promise<Deployment[]> {
    const data = await this.execute('Deployments', { input: { projectId, environmentId, serviceId }, first: 10 })
    return connection(z.object({ id: z.string(), status: z.string(), createdAt: z.string() })).parse(data.deployments).edges.map(edge => edge.node)
  }
  async deployment(id: string): Promise<Deployment> {
    const data = await this.execute('Deployment', { id })
    return z.object({ id: z.string(), status: z.string(), createdAt: z.string(), meta: z.unknown().optional() }).parse(data.deployment)
  }
  async logs(id: string, type: 'build' | 'runtime', since?: string): Promise<LogLine[]> {
    const operation = type === 'build' ? 'BuildLogs' : 'DeploymentLogs'
    const data = await this.execute(operation, { deploymentId: id, limit: 200, ...(type === 'runtime' && since ? { startDate: since } : {}) })
    return z.array(z.object({ timestamp: z.string(), message: z.string(), severity: z.string().nullable().optional() })).parse(data[type === 'build' ? 'buildLogs' : 'deploymentLogs'])
  }
  async stop(id: string): Promise<void> { await this.execute('DeploymentStop', { id }) }
  async restart(id: string): Promise<void> { await this.execute('DeploymentRestart', { id }) }
  async delete(id: string): Promise<void> { await this.execute('ServiceDelete', { id }) }
}

function connection<T extends z.ZodType>(node: T) { return z.object({ edges: z.array(z.object({ node })) }) }
