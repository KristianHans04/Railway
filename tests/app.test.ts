import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/server/app'
import { RailwayClient } from '../src/server/railway'

const secret = '4a'.repeat(32)
const origin = 'http://localhost:3000'
const projectId = crypto.randomUUID()
const environmentId = crypto.randomUUID()
const serviceId = crypto.randomUUID()
const deploymentId = crypto.randomUUID()

function setup() {
  let status = 'QUEUED'
  let created = false
  let hasDeployment = true
  let deleted = false
  const calls: string[] = []
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const { operationName } = JSON.parse(String(init?.body)) as { operationName: string }
    calls.push(operationName)
    const data: Record<string, unknown> = {
      ProjectToken: { projectToken: { projectId, environmentId } },
      Projects: { projects: { edges: [{ node: { id: projectId, name: 'Test project' } }] } },
      Project: { project: { id: projectId, name: 'Test project', environments: { edges: [{ node: { id: environmentId, name: 'production' } }] }, services: { edges: created && !deleted ? [{ node: { id: serviceId, name: 'test-service' } }] : [] } } },
      ServiceCreate: { serviceCreate: { id: serviceId, name: 'test-service' } },
      Deployments: { deployments: { edges: created && hasDeployment && !deleted ? [{ node: { id: deploymentId, status, createdAt: '2026-01-01T00:00:00Z' } }] : [] } },
      ServiceDeploy: { serviceInstanceDeployV2: deploymentId },
      Deployment: { deployment: { id: deploymentId, status, createdAt: '2026-01-01T00:00:00Z' } },
      DeploymentLogs: { deploymentLogs: [{ timestamp: '2026-01-01T00:00:00Z', message: 'Ready', severity: 'info' }] },
      BuildLogs: { buildLogs: [] },
      DeploymentStop: { deploymentStop: true },
      DeploymentRestart: { deploymentRestart: true },
      ServiceDelete: { serviceDelete: true },
    }
    if (operationName === 'ServiceCreate') created = true
    if (operationName === 'ServiceDeploy') hasDeployment = true
    if (operationName === 'DeploymentStop') status = 'REMOVED'
    if (operationName === 'DeploymentRestart') status = 'SUCCESS'
    if (operationName === 'ServiceDelete') deleted = true
    return Response.json({ data: data[operationName] })
  })
  const app = createApp({ SESSION_SECRET: secret, APP_ORIGIN: origin }, (session, report) => new RailwayClient(session, fetcher as typeof fetch, report))
  let cookie = ''
  let csrf = ''
  async function req(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown, overrides?: Record<string, string>) {
    const response = await app.request(`http://localhost:3000${path}`, { method, headers: { cookie, ...(method === 'POST' ? { origin, 'x-csrf-token': csrf, 'content-type': 'application/json' } : {}), ...overrides }, body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined })
    const cookies = response.headers.getSetCookie()
    for (const set of cookies) {
      const pair = set.split(';')[0]!
      cookie = [cookie.split('; ').filter(value => !value.startsWith(pair.split('=')[0] + '=')), pair].flat().filter(Boolean).join('; ')
      if (pair.startsWith('lc_csrf=')) csrf = pair.slice(8)
    }
    return response
  }
  return { req, calls, setStatus: (next: string) => { status = next }, setHasDeployment: (next: boolean) => { hasDeployment = next } }
}

describe('application lifecycle', () => {
  it('connects, creates, reads queued logs, stops, restarts and deletes with scope checks', async () => {
    const { req, calls, setStatus } = setup()
    expect((await req('/api/session')).status).toBe(200)
    const connected = await req('/api/connect', 'POST', { type: 'project', token: 'test-project-token-123' })
    expect(connected.status).toBe(200)
    expect(connected.headers.get('set-cookie')).toContain('HttpOnly')
    expect(JSON.stringify(await connected.json())).not.toContain('test-project-token-123')
    expect((await req('/api/projects')).status).toBe(200)
    expect((await req(`/api/projects/${projectId}`)).status).toBe(200)
    const create = await req('/api/services', 'POST', { projectId, environmentId, image: 'nginx:stable-alpine', name: 'test-service' })
    expect(create.status).toBe(201)
    const deployments = await req(`/api/services/${serviceId}/deployments?projectId=${projectId}&environmentId=${environmentId}`)
    expect((await deployments.json()).deployments[0].status).toBe('QUEUED')
    setStatus('SUCCESS')
    const stop = await req(`/api/deployments/${deploymentId}/stop`, 'POST', { projectId, environmentId, serviceId })
    expect(stop.status).toBe(200)
    expect(calls).toContain('DeploymentStop')
    expect((await req(`/api/deployments/${deploymentId}/logs?projectId=${projectId}&environmentId=${environmentId}&serviceId=${serviceId}&type=runtime`)).status).toBe(200)
    setStatus('CRASHED')
    expect((await req(`/api/deployments/${deploymentId}/restart`, 'POST', { projectId, environmentId, serviceId })).status).toBe(200)
    expect((await req(`/api/services/${serviceId}/delete`, 'POST', { projectId, environmentId, confirmName: 'wrong' })).status).toBe(400)
    expect((await req(`/api/services/${serviceId}/delete`, 'POST', { projectId, environmentId, confirmName: 'test-service' })).status).toBe(200)
  })
  it('rejects wrong origin, missing CSRF and out of scope context', async () => {
    const { req } = setup()
    await req('/api/session')
    expect((await req('/api/connect', 'POST', { type: 'project', token: 'test-project-token-123' }, { origin: 'https://attacker.example' })).status).toBe(403)
    expect((await req('/api/connect', 'POST', { type: 'project', token: 'test-project-token-123' }, { 'x-csrf-token': '' })).status).toBe(403)
    const connected = await req('/api/connect', 'POST', { type: 'project', token: 'test-project-token-123' })
    expect(connected.status).toBe(200)
    expect((await req('/api/connect', 'POST', Symbol('invalid'))).status).toBe(400)
    expect((await req('/api/services', 'POST', { projectId: crypto.randomUUID(), environmentId, image: 'nginx:stable-alpine' })).status).toBe(403)
  })
  it('limits repeated connection attempts', async () => {
    const { req } = setup()
    await req('/api/session')
    for (let n = 0; n < 5; n++) expect((await req('/api/connect', 'POST', { type: 'project', token: 'test-project-token-123' })).status).toBe(200)
    expect((await req('/api/connect', 'POST', { type: 'project', token: 'test-project-token-123' })).status).toBe(429)
  })
  it('supports account discovery and an explicit environment deployment', async () => {
    const { req, setHasDeployment, calls } = setup()
    await req('/api/session')
    expect((await req('/api/connect', 'POST', { type: 'account', token: 'test-account-token-123' })).status).toBe(200)
    const projects = await req('/api/projects')
    expect((await projects.json()).projects[0].name).toBe('Test project')
    expect((await req('/api/services', 'POST', { projectId, environmentId, image: 'nginx:stable-alpine', name: 'test-service' })).status).toBe(201)
    setHasDeployment(false)
    const deploy = await req(`/api/services/${serviceId}/deploy`, 'POST', { projectId, environmentId })
    expect(deploy.status).toBe(202)
    expect((await deploy.json()).deploymentId).toBe(deploymentId)
    expect(calls).toContain('ServiceDeploy')
    expect((await req(`/api/deployments/${deploymentId}?projectId=${projectId}&environmentId=${environmentId}&serviceId=${serviceId}`)).status).toBe(200)
    expect((await req(`/api/deployments/${deploymentId}/logs?projectId=${projectId}&environmentId=${environmentId}&serviceId=${serviceId}&type=build`)).status).toBe(200)
    expect((await req('/api/disconnect', 'POST')).status).toBe(200)
    expect((await req('/api/session')).status).toBe(200)
  })
  it('rejects resources outside a project token scope at every lifecycle boundary', async () => {
    const { req } = setup()
    await req('/api/session')
    await req('/api/connect', 'POST', { type: 'project', token: 'test-project-token-123' })
    expect((await req(`/api/projects/${crypto.randomUUID()}`)).status).toBe(403)
    expect((await req('/api/services', 'POST', { projectId, environmentId: crypto.randomUUID(), image: 'nginx:stable-alpine' })).status).toBe(403)
    expect((await req(`/api/services/${crypto.randomUUID()}/deployments?projectId=${projectId}&environmentId=${environmentId}`)).status).toBe(403)
    await req('/api/services', 'POST', { projectId, environmentId, image: 'nginx:stable-alpine', name: 'test-service' })
    const otherDeployment = crypto.randomUUID()
    const context = `projectId=${projectId}&environmentId=${environmentId}&serviceId=${serviceId}`
    expect((await req(`/api/deployments/${otherDeployment}?${context}`)).status).toBe(403)
    expect((await req(`/api/deployments/${otherDeployment}/logs?${context}&type=runtime`)).status).toBe(403)
    expect((await req(`/api/deployments/${otherDeployment}/stop`, 'POST', { projectId, environmentId, serviceId })).status).toBe(403)
  })
  it('blocks invalid actions and duplicate deployment requests', async () => {
    const { req } = setup()
    await req('/api/session')
    await req('/api/connect', 'POST', { type: 'project', token: 'test-project-token-123' })
    await req('/api/services', 'POST', { projectId, environmentId, image: 'nginx:stable-alpine', name: 'test-service' })
    expect((await req(`/api/services/${serviceId}/deploy`, 'POST', { projectId, environmentId })).status).toBe(400)
    expect((await req(`/api/deployments/${deploymentId}/stop`, 'POST', { projectId, environmentId, serviceId })).status).toBe(400)
    expect((await req(`/api/deployments/${deploymentId}/pause`, 'POST', { projectId, environmentId, serviceId })).status).toBe(400)
  })
})
