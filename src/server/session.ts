import type { TokenType } from '../shared/domain'

export type Session = { v: 1; type: TokenType; token: string; expires: number; projectId?: string; environmentId?: string }
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function keyBytes(secret: string): Uint8Array {
  if (!/^[a-fA-F0-9]{64}$/.test(secret)) throw new Error('SESSION_SECRET must be 64 hexadecimal characters')
  return Uint8Array.from(secret.match(/../g)!, byte => Number.parseInt(byte, 16))
}
async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes(secret) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
function fromBase64url(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  return Uint8Array.from(atob(normalized), char => char.charCodeAt(0))
}
export async function sealSession(session: Session, secret: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, await key(secret), encoder.encode(JSON.stringify(session))))
  const result = new Uint8Array(nonce.length + cipher.length)
  result.set(nonce)
  result.set(cipher, nonce.length)
  return base64url(result)
}
export async function openSession(value: string | undefined, secret: string): Promise<Session | null> {
  if (!value || value.length > 4096) return null
  try {
    const bytes = fromBase64url(value)
    if (bytes.length < 29) return null
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await key(secret), bytes.slice(12))
    const parsed: unknown = JSON.parse(decoder.decode(plain))
    if (!parsed || typeof parsed !== 'object') return null
    const session = parsed as Partial<Session>
    if (session.v !== 1 || !['project', 'account'].includes(session.type ?? '') || typeof session.token !== 'string' || typeof session.expires !== 'number' || session.expires < Date.now()) return null
    return session as Session
  } catch { return null }
}

export const SESSION_SECONDS = 60 * 60 * 4
