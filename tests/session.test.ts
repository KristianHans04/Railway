import { describe, expect, it } from 'vitest'
import { openSession, sealSession } from '../src/server/session'

const secret = '7d'.repeat(32)
describe('encrypted session', () => {
  it('round trips without exposing the credential', async () => {
    const token = 'railway-personal-test-token'
    const sealed = await sealSession({ v: 1, type: 'project', token, expires: Date.now() + 10000 }, secret)
    expect(sealed).not.toContain(token)
    expect(await openSession(sealed, secret)).toMatchObject({ type: 'project', token })
  })
  it('rejects tampering and expiry', async () => {
    const sealed = await sealSession({ v: 1, type: 'account', token: 'test', expires: Date.now() - 1 }, secret)
    expect(await openSession(sealed, secret)).toBeNull()
    expect(await openSession(`${sealed}broken`, secret)).toBeNull()
  })
  it('rejects bad configuration and malformed session content', async () => {
    await expect(sealSession({ v: 1, type: 'project', token: 'x', expires: Date.now() + 1000 }, 'invalid')).rejects.toThrow('SESSION_SECRET')
    expect(await openSession(undefined, secret)).toBeNull()
    expect(await openSession('x'.repeat(5000), secret)).toBeNull()
    expect(await openSession('bad', secret)).toBeNull()
    const malformed = await sealSession(null as never, secret)
    expect(await openSession(malformed, secret)).toBeNull()
    const badVersion = await sealSession({ v: 2, type: 'project', token: 'x', expires: Date.now() + 1000 } as never, secret)
    expect(await openSession(badVersion, secret)).toBeNull()
  })
})
