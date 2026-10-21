import { describe, expect, it, vi } from 'vitest'
import { RailwayClient, RailwayError, retryAfterSeconds } from '../src/server/railway'

const project = { type: 'project' as const, token: 'project-token' }
describe('Railway transport', () => {
  it('uses the project token header and fixed query', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Project-Access-Token')).toBe('project-token')
      expect(new Headers(init?.headers).get('Authorization')).toBeNull()
      expect(JSON.parse(String(init?.body)).operationName).toBe('ProjectToken')
      return Response.json({ data: { projectToken: { projectId: crypto.randomUUID(), environmentId: crypto.randomUUID() } } })
    })
    await new RailwayClient(project, fetcher as typeof fetch).validate()
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('normalizes GraphQL 200 errors without retrying a mutation', async () => {
    const fetcher = vi.fn(async () => Response.json({ errors: [{ message: 'Not Authorized', extensions: { code: 'INTERNAL_SERVER_ERROR', traceId: 'trace-1' } }] }))
    await expect(new RailwayClient(project, fetcher as typeof fetch).stop(crypto.randomUUID())).rejects.toMatchObject({ kind: 'permission', traceId: 'trace-1' })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('maps a missing project token to an authentication error', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: null, errors: [{ message: 'Project Token not found', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] }))
    await expect(new RailwayClient(project, fetcher as typeof fetch).validate()).rejects.toMatchObject({ kind: 'auth' })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('reports mutation network uncertainty and never retries', async () => {
    const fetcher = vi.fn(async () => { throw new Error('network') })
    await expect(new RailwayClient(project, fetcher as typeof fetch).create(crypto.randomUUID(), crypto.randomUUID(), 'example', 'nginx:stable-alpine')).rejects.toMatchObject({ kind: 'uncertain' })
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('passes the selected environment to service creation', async () => {
    const projectId = crypto.randomUUID()
    const environmentId = crypto.randomUUID()
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).variables.input).toEqual({ projectId, environmentId, name: 'example', source: { image: 'nginx:stable-alpine' } })
      return Response.json({ data: { serviceCreate: { id: crypto.randomUUID(), name: 'example' } } })
    })
    await new RailwayClient(project, fetcher as typeof fetch).create(projectId, environmentId, 'example', 'nginx:stable-alpine')
  })
  it('retries temporary reads only', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ errors: [{ message: 'busy', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] }, { status: 503 })).mockResolvedValueOnce(Response.json({ data: { projects: { edges: [] } } }))
    expect(await new RailwayClient(project, fetcher as typeof fetch).listProjects()).toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('parses Retry-After values', () => { expect(retryAfterSeconds('8')).toBe(8); expect(retryAfterSeconds('invalid')).toBeUndefined() })
  it('exposes rate limits without leaking response messages', async () => {
    const fetcher = vi.fn(async () => Response.json({ errors: [{ message: 'hidden info' }] }, { status: 429, headers: { 'Retry-After': '1' } }))
    try { await new RailwayClient(project, fetcher as typeof fetch).stop(crypto.randomUUID()) }
    catch (error) { expect(error).toBeInstanceOf(RailwayError); expect(error).toMatchObject({ kind: 'rate_limit', retryAfter: 1 }); expect(String(error)).not.toContain('hidden info') }
  })
  it('uses Bearer authentication for account discovery', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer account-token')
      expect(new Headers(init?.headers).get('Project-Access-Token')).toBeNull()
      return Response.json({ data: { projects: { edges: [] } } })
    })
    expect(await new RailwayClient({ type: 'account', token: 'account-token' }, fetcher as typeof fetch).validate()).toEqual({})
  })
  it('handles malformed and empty successful responses without retrying mutations', async () => {
    const malformed = vi.fn(async () => new Response('not json', { status: 200 }))
    await expect(new RailwayClient(project, malformed as typeof fetch).stop(crypto.randomUUID())).rejects.toMatchObject({ kind: 'uncertain' })
    expect(malformed).toHaveBeenCalledOnce()
    await expect(new RailwayClient(project, malformed as typeof fetch).listProjects()).rejects.toMatchObject({ kind: 'upstream' })
    const empty = vi.fn(async () => Response.json({ data: null }))
    await expect(new RailwayClient(project, empty as typeof fetch).listProjects()).rejects.toMatchObject({ kind: 'upstream' })
  })
  it('fails reads after bounded network retries', async () => {
    const fetcher = vi.fn(async () => { throw new Error('offline') })
    await expect(new RailwayClient(project, fetcher as typeof fetch).listProjects()).rejects.toMatchObject({ kind: 'temporary' })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})
