import type { Deployment, LogLine, Project, Service } from '../shared/domain'

export type SessionInfo = { connected: boolean; type?: 'project' | 'account'; projectId?: string; environmentId?: string }
export class AppError extends Error {
  constructor(message: string, public kind = 'application', public retryAfter?: number, public traceId?: string) { super(message) }
}
function csrf(): string {
  return document.cookie.split('; ').find(piece => piece.startsWith('lc_csrf='))?.slice(8) ?? ''
}
export async function request<T>(path: string, options?: { method?: 'POST'; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { method: options?.method ?? 'GET', credentials: 'same-origin', headers: options?.method ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() } : undefined, body: options?.method ? JSON.stringify(options.body ?? {}) : undefined, signal: options?.signal })
  } catch {
    throw new AppError('Network connection lost. Check your connection and try again.', 'network')
  }
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload && typeof payload === 'object' ? payload as { error?: string; kind?: string; retryAfter?: number; traceId?: string } : {}
    throw new AppError(error.error ?? 'The server could not complete this request.', error.kind, error.retryAfter, error.traceId)
  }
  return payload as T
}
export const api = {
  session: () => request<SessionInfo>('/api/session'),
  connect: (type: 'project' | 'account', token: string) => request<SessionInfo>('/api/connect', { method: 'POST', body: { type, token } }),
  disconnect: () => request<SessionInfo>('/api/disconnect', { method: 'POST' }),
  projects: () => request<{ projects: Pick<Project, 'id' | 'name'>[] }>('/api/projects'),
  project: (id: string) => request<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}`),
  create: (input: { projectId: string; environmentId: string; image: string; name?: string }) => request<{ service: Service; image: string; projectId: string; environmentId: string }>('/api/services', { method: 'POST', body: input }),
  deployments: (serviceId: string, projectId: string, environmentId: string) => request<{ deployments: Deployment[] }>(`/api/services/${serviceId}/deployments?${new URLSearchParams({ projectId, environmentId })}`),
  deploy: (serviceId: string, projectId: string, environmentId: string) => request<{ deploymentId: string }>(`/api/services/${serviceId}/deploy`, { method: 'POST', body: { projectId, environmentId } }),
  deployment: (deploymentId: string, serviceId: string, projectId: string, environmentId: string) => request<{ deployment: Deployment }>(`/api/deployments/${deploymentId}?${new URLSearchParams({ serviceId, projectId, environmentId })}`),
  logs: (deploymentId: string, serviceId: string, projectId: string, environmentId: string, type: 'build' | 'runtime', since?: string) => request<{ lines: LogLine[] }>(`/api/deployments/${deploymentId}/logs?${new URLSearchParams({ serviceId, projectId, environmentId, type, ...(since ? { since } : {}) })}`),
  action: (deploymentId: string, action: 'stop' | 'restart', serviceId: string, projectId: string, environmentId: string) => request<{ accepted: true }>(`/api/deployments/${deploymentId}/${action}`, { method: 'POST', body: { serviceId, projectId, environmentId } }),
  delete: (serviceId: string, projectId: string, environmentId: string, confirmName: string) => request<{ deleted: true }>(`/api/services/${serviceId}/delete`, { method: 'POST', body: { projectId, environmentId, confirmName } }),
}
