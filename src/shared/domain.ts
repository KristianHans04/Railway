import { z } from 'zod'

export const tokenTypeSchema = z.enum(['project', 'account'])
export type TokenType = z.infer<typeof tokenTypeSchema>
export const connectSchema = z.object({ type: tokenTypeSchema, token: z.string().trim().min(16).max(1024) }).strict()
export const idSchema = z.string().uuid()
export const imageSchema = z.string().trim().min(3).max(256).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/@-]*$/, 'Use a public image reference, such as nginx:stable-alpine.').refine(value => !value.includes('://'), 'Use an image reference without a URL scheme.')
export const serviceNameSchema = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Use letters, numbers, periods, hyphens or underscores.')
export const createSchema = z.object({
  projectId: idSchema,
  environmentId: idSchema,
  image: imageSchema,
  name: serviceNameSchema.optional(),
}).strict()

export type Deployment = { id: string; status: string; createdAt: string; meta?: unknown }
export type Service = { id: string; name: string }
export type Environment = { id: string; name: string }
export type Project = { id: string; name: string; environments: Environment[]; services: Service[] }
export type LogLine = { timestamp: string; message: string; severity?: string | null }

export type Lifecycle = {
  label: string
  phase: 'created' | 'queued' | 'building' | 'deploying' | 'running' | 'stopped' | 'failed' | 'unknown'
  tone: 'neutral' | 'progress' | 'success' | 'danger'
  poll: boolean
  stop: boolean
  restart: boolean
  explanation: string
}

export function lifecycle(status: string | null): Lifecycle {
  if (status === null) return { label: 'Waiting for deployment', phase: 'created', tone: 'progress', poll: true, stop: false, restart: false, explanation: 'Service created. Waiting for Railway to report its first deployment.' }
  switch (status?.toUpperCase()) {
    case 'INITIALIZING':
    case 'QUEUED':
    case 'WAITING': return { label: status.toUpperCase() === 'WAITING' ? 'Waiting' : 'Queued', phase: 'queued', tone: 'progress', poll: true, stop: false, restart: false, explanation: 'Railway has not started deployment yet.' }
    case 'NEEDS_APPROVAL': return { label: 'Needs approval', phase: 'queued', tone: 'progress', poll: true, stop: false, restart: false, explanation: 'Railway is waiting for deployment approval in its dashboard.' }
    case 'BUILDING': return { label: 'Building', phase: 'building', tone: 'progress', poll: true, stop: false, restart: false, explanation: 'Railway is preparing the image.' }
    case 'DEPLOYING': return { label: 'Deploying', phase: 'deploying', tone: 'progress', poll: true, stop: false, restart: false, explanation: 'Railway is starting the workload.' }
    case 'SUCCESS':
    case 'ACTIVE': return { label: 'Running', phase: 'running', tone: 'success', poll: true, stop: true, restart: true, explanation: 'Railway reports the deployment is running.' }
    case 'SLEEPING': return { label: 'Sleeping', phase: 'stopped', tone: 'neutral', poll: true, stop: false, restart: true, explanation: 'Railway has put this deployment to sleep.' }
    case 'COMPLETED': return { label: 'Completed', phase: 'stopped', tone: 'neutral', poll: false, stop: false, restart: false, explanation: 'The process exited successfully.' }
    case 'REMOVING': return { label: 'Stopping', phase: 'stopped', tone: 'progress', poll: true, stop: false, restart: false, explanation: 'Railway is removing this deployment.' }
    case 'REMOVED': return { label: 'Stopped', phase: 'stopped', tone: 'neutral', poll: false, stop: false, restart: false, explanation: 'The deployment is no longer running. Service configuration remains.' }
    case 'FAILED': return { label: 'Failed', phase: 'failed', tone: 'danger', poll: false, stop: false, restart: false, explanation: 'Railway could not complete the deployment. Check build and deploy logs.' }
    case 'CRASHED': return { label: 'Crashed', phase: 'failed', tone: 'danger', poll: false, stop: false, restart: true, explanation: 'The workload started but then crashed. Check runtime logs.' }
    case 'SKIPPED':
    case 'CANCELLED': return { label: status.toUpperCase() === 'SKIPPED' ? 'Skipped' : 'Cancelled', phase: 'stopped', tone: 'neutral', poll: false, stop: false, restart: false, explanation: 'Railway did not run this deployment.' }
    default: return { label: `Unknown state: ${status}`, phase: 'unknown', tone: 'neutral', poll: true, stop: false, restart: false, explanation: 'Railway returned an unrecognized state. Actions are unavailable until it is understood.' }
  }
}
