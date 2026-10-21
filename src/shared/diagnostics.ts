import type { Deployment, LogLine } from './domain'

const sensitiveKey = /authorization|cookie|token|password|secret|api[_-]?key|private[_-]?key|environment|variables/i
const credentialPattern = /\b(?:Bearer\s+[A-Za-z0-9._~-]+|(?:RAILWAY_(?:API_)?TOKEN|API_KEY|SECRET|PASSWORD)\s*[:=]\s*[^\s,;]+|[A-Za-z0-9_-]{40,})\b/gi

export function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(credentialPattern, '[redacted]')
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !sensitiveKey.test(key)).map(([key, entry]) => [key, redact(entry)]))
  return value
}

export function diagnostics(input: { serviceId: string; deployment: Deployment | null; logs: LogLine[] }): string {
  return JSON.stringify(redact({
    serviceId: input.serviceId,
    deploymentId: input.deployment?.id ?? null,
    status: input.deployment?.status ?? 'PENDING',
    createdAt: input.deployment?.createdAt ?? null,
    recentLogs: input.logs.slice(-100).map(line => ({ timestamp: line.timestamp, message: line.message })),
  }), null, 2)
}
