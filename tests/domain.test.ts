import { describe, expect, it } from 'vitest'
import { createSchema, imageSchema, lifecycle } from '../src/shared/domain'
import { diagnostics, redact } from '../src/shared/diagnostics'

describe('deployment lifecycle', () => {
  it.each([
    ['QUEUED', 'queued', false, false, true],
    ['NEEDS_APPROVAL', 'queued', false, false, true],
    ['BUILDING', 'building', false, false, true],
    ['DEPLOYING', 'deploying', false, false, true],
    ['SUCCESS', 'running', true, true, true],
    ['CRASHED', 'failed', false, true, false],
    ['FAILED', 'failed', false, false, false],
    ['REMOVED', 'stopped', false, false, false],
    ['SLEEPING', 'stopped', false, true, true],
    ['FUTURE_STATE', 'unknown', false, false, true],
  ] as const)('%s maps to %s with safe actions', (raw, phase, stop, restart, poll) => {
    expect(lifecycle(raw)).toMatchObject({ phase, stop, restart, poll })
  })
  it('does not claim an unreported deployment is running', () => expect(lifecycle(null).phase).toBe('created'))
})

describe('validation', () => {
  it('accepts a public image', () => expect(imageSchema.parse('nginx:stable-alpine')).toBe('nginx:stable-alpine'))
  it('rejects shell and URL input', () => { expect(imageSchema.safeParse('nginx; echo bad').success).toBe(false); expect(imageSchema.safeParse('https://example.com').success).toBe(false) })
  it('rejects extra creation fields', () => expect(createSchema.safeParse({ projectId: crypto.randomUUID(), environmentId: crypto.randomUUID(), image: 'nginx:stable-alpine', variables: { SECRET: 'bad' } }).success).toBe(false))
})

describe('diagnostics', () => {
  it('removes secret fields and token patterns', () => {
    expect(redact({ authorization: 'Bearer abcdef', nested: { password: 'x', message: 'RAILWAY_TOKEN=abcdef' } })).toEqual({ nested: { message: '[redacted]' } })
    const output = diagnostics({ serviceId: 'service', deployment: { id: 'deployment', status: 'FAILED', createdAt: '2026-01-01' }, logs: [{ timestamp: '2026-01-01', message: 'API_KEY=secretvalue' }] })
    expect(output).not.toContain('secretvalue')
    expect(output).toContain('[redacted]')
  })
  it('bounds diagnostic logs', () => {
    const logs = Array.from({ length: 200 }, (_, n) => ({ timestamp: String(n), message: String(n) }))
    expect(JSON.parse(diagnostics({ serviceId: 'service', deployment: null, logs })).recentLogs).toHaveLength(100)
  })
})
