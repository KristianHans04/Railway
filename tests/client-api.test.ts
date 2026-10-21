// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, AppError, request } from '../src/client/api'

afterEach(() => { vi.unstubAllGlobals(); document.cookie = 'lc_csrf=; Max-Age=0' })

describe('client API boundary', () => {
  it('sends CSRF on writes and never persists the token', async () => {
    document.cookie = 'lc_csrf=test-csrf'
    const fetcher = vi.fn(async () => Response.json({ connected: true }))
    vi.stubGlobal('fetch', fetcher)
    await api.connect('project', 'railway-token-example')
    const [path, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/connect')
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('test-csrf')
    expect(init.credentials).toBe('same-origin')
    expect(localStorage.getItem('token')).toBeNull()
  })
  it('normalizes server and network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Rate limited', kind: 'rate_limit', retryAfter: 8, traceId: 'trace' }, { status: 429 })))
    await expect(api.session()).rejects.toMatchObject({ kind: 'rate_limit', retryAfter: 8, traceId: 'trace' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(api.session()).rejects.toMatchObject({ kind: 'network' })
  })
  it('uses fixed routes for every domain operation', async () => {
    const fetcher = vi.fn(async () => Response.json({}))
    vi.stubGlobal('fetch', fetcher)
    await api.session()
    await api.disconnect()
    await api.projects()
    await api.project('project')
    await api.create({ projectId: 'project', environmentId: 'environment', image: 'nginx' })
    await api.deployments('service', 'project', 'environment')
    await api.deploy('service', 'project', 'environment')
    await api.deployment('deployment', 'service', 'project', 'environment')
    await api.logs('deployment', 'service', 'project', 'environment', 'runtime', '2026-01-01T00:00:00Z')
    await api.action('deployment', 'stop', 'service', 'project', 'environment')
    await api.delete('service', 'project', 'environment', 'name')
    expect(fetcher).toHaveBeenCalledTimes(11)
    expect((fetcher.mock.calls as unknown as Array<[string]>).map(call => call[0])).toContain('/api/services/service/deploy')
  })
  it('uses a safe generic error for malformed responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 500 })))
    await expect(request('/api/session')).rejects.toBeInstanceOf(AppError)
  })
})
