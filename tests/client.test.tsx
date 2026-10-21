// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from '../src/client/App'
import { DeploymentView } from '../src/client/DeploymentView'
import { api } from '../src/client/api'

const projectId = '11111111-1111-4111-8111-111111111111'
const environmentId = '22222222-2222-4222-8222-222222222222'
const service = { id: '33333333-3333-4333-8333-333333333333', name: 'web-preview' }
const deployment = { id: '44444444-4444-4444-8444-444444444444', status: 'QUEUED', createdAt: '2026-01-01T00:00:00Z' }
const project = { id: projectId, name: 'Demo project', environments: [{ id: environmentId, name: 'production' }], services: [service] }

function mount(node: React.ReactNode) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={cache}>{node}</QueryClientProvider>)
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

describe('client flow', () => {
  it('connects from the product shell and resolves a project token context', async () => {
    vi.spyOn(api, 'session').mockResolvedValue({ connected: false })
    vi.spyOn(api, 'connect').mockResolvedValue({ connected: true, type: 'project', projectId, environmentId })
    vi.spyOn(api, 'projects').mockResolvedValue({ projects: [{ id: projectId, name: project.name }] })
    vi.spyOn(api, 'project').mockResolvedValue({ project: { ...project, services: [] } })
    mount(<App />)
    await screen.findByRole('heading', { name: 'Connect Railway' })
    fireEvent.change(screen.getByLabelText('Railway token'), { target: { value: 'test-token-for-connection' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect Railway' }))
    await screen.findByText('Railway connected')
    expect(await screen.findByText('Demo project')).toBeTruthy()
    expect((screen.getByLabelText('Public container image') as HTMLInputElement).value).toBe('')
  })

  it('launches an image and shows Railway state and logs', async () => {
    vi.spyOn(api, 'session').mockResolvedValue({ connected: true, type: 'project', projectId, environmentId })
    vi.spyOn(api, 'projects').mockResolvedValue({ projects: [{ id: projectId, name: project.name }] })
    vi.spyOn(api, 'project').mockResolvedValue({ project: { ...project, services: [] } })
    vi.spyOn(api, 'create').mockResolvedValue({ service, image: 'nginx:stable-alpine', projectId, environmentId })
    vi.spyOn(api, 'deployments').mockResolvedValue({ deployments: [deployment] })
    vi.spyOn(api, 'logs').mockResolvedValue({ lines: [{ timestamp: deployment.createdAt, message: 'Container started', severity: 'info' }] })
    mount(<App />)
    const image = await screen.findByLabelText('Public container image')
    fireEvent.change(image, { target: { value: 'nginx:stable-alpine' } })
    fireEvent.change(screen.getByLabelText(/Service name/), { target: { value: 'web-preview' } })
    fireEvent.click(screen.getByRole('button', { name: 'Launch container' }))
    await screen.findByRole('heading', { name: 'web-preview' })
    await screen.findByText('Container started')
    expect(screen.getByText('Railway has not started deployment yet.')).toBeTruthy()
  })

  it('keeps Stop and Delete separate and waits for reported state', async () => {
    let status = 'SUCCESS'
    vi.spyOn(api, 'deployments').mockImplementation(async () => ({ deployments: [{ ...deployment, status }] }))
    vi.spyOn(api, 'logs').mockResolvedValue({ lines: [] })
    const action = vi.spyOn(api, 'action').mockImplementation(async () => { status = 'REMOVED'; return { accepted: true } })
    const deletion = vi.spyOn(api, 'delete').mockResolvedValue({ deleted: true })
    const onDeleted = vi.fn()
    mount(<DeploymentView service={service} projectId={projectId} environmentId={environmentId} image="nginx:stable-alpine" onDeleted={onDeleted} />)
    await screen.findByRole('button', { name: 'Stop deployment' })
    fireEvent.click(screen.getByRole('button', { name: 'Stop deployment' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Stopped'))
    expect(action).toHaveBeenCalledWith(deployment.id, 'stop', service.id, projectId, environmentId)
    fireEvent.click(screen.getByText('Delete service', { selector: 'summary' }))
    fireEvent.change(screen.getByLabelText('Type the exact service name'), { target: { value: service.name } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete service' }))
    await waitFor(() => expect(deletion).toHaveBeenCalledOnce())
    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce())
  })

  it('selects account context, validates the form and disconnects', async () => {
    vi.spyOn(api, 'session').mockResolvedValue({ connected: true, type: 'account' })
    vi.spyOn(api, 'projects').mockResolvedValue({ projects: [{ id: projectId, name: project.name }] })
    vi.spyOn(api, 'project').mockResolvedValue({ project })
    vi.spyOn(api, 'disconnect').mockResolvedValue({ connected: false })
    mount(<App />)
    await screen.findByLabelText('Project')
    await screen.findByLabelText('Environment')
    fireEvent.change(screen.getByLabelText('Environment'), { target: { value: environmentId } })
    await screen.findByLabelText('Public container image')
    fireEvent.change(screen.getByLabelText('Public container image'), { target: { value: 'https://bad.example/image' } })
    fireEvent.click(screen.getByRole('button', { name: 'Launch container' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Dark theme' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    await screen.findByRole('heading', { name: 'Connect Railway' })
  })

  it('offers an explicit deploy only when no deployment exists in the environment', async () => {
    vi.spyOn(api, 'deployments').mockResolvedValue({ deployments: [] })
    const deploy = vi.spyOn(api, 'deploy').mockResolvedValue({ deploymentId: deployment.id })
    mount(<DeploymentView service={service} projectId={projectId} environmentId={environmentId} image="" onDeleted={() => {}} />)
    await screen.findByText('Railway has not reported a deployment in this environment.')
    fireEvent.click(screen.getByRole('button', { name: 'Deploy in this environment' }))
    await waitFor(() => expect(deploy).toHaveBeenCalledWith(service.id, projectId, environmentId))
  })

  it('shows a crash and offers process restart', async () => {
    vi.spyOn(api, 'deployments').mockResolvedValue({ deployments: [{ ...deployment, status: 'CRASHED' }] })
    vi.spyOn(api, 'logs').mockRejectedValue(new Error('Log request failed'))
    const action = vi.spyOn(api, 'action').mockResolvedValue({ accepted: true })
    mount(<DeploymentView service={service} projectId={projectId} environmentId={environmentId} image="" onDeleted={() => {}} />)
    await screen.findByRole('button', { name: 'Restart process' })
    expect(await screen.findByText(/Logs unavailable/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Restart process' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith(deployment.id, 'restart', service.id, projectId, environmentId))
  })
})
