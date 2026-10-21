import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, AppError } from './api'
import { imageSchema, serviceNameSchema, type Service } from '../shared/domain'
import { DeploymentView } from './DeploymentView'

function message(error: unknown): string { return error instanceof Error ? error.message : 'The request could not be completed.' }

export function App() {
  const cache = useQueryClient()
  const session = useQuery({ queryKey: ['session'], queryFn: api.session })
  const [projectId, setProjectId] = useState('')
  const [environmentId, setEnvironmentId] = useState('')
  const [service, setService] = useState<Service | null>(null)
  const [createdAt, setCreatedAt] = useState<number | undefined>()
  const [image, setImage] = useState('')
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [mobileCreate, setMobileCreate] = useState(false)
  const createPanel = useRef<HTMLElement>(null)
  const openCreateButton = useRef<HTMLButtonElement>(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') === 'dark' ? 'dark' : 'light')

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme) }, [theme])
  useEffect(() => {
    if (!mobileCreate) return
    const panel = createPanel.current
    panel?.querySelector<HTMLInputElement>('input')?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { setMobileCreate(false); openCreateButton.current?.focus(); return }
      if (event.key !== 'Tab' || !panel) return
      const elements = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')]
      const first = elements[0]
      const last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileCreate])
  useEffect(() => {
    if (session.data?.type === 'project' && session.data.projectId && session.data.environmentId) {
      setProjectId(session.data.projectId)
      setEnvironmentId(session.data.environmentId)
    }
  }, [session.data])
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.projects, enabled: !!session.data?.connected })
  useEffect(() => { if (!projectId && projects.data?.projects.length === 1) setProjectId(projects.data.projects[0]!.id) }, [projectId, projects.data])
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => api.project(projectId), enabled: !!projectId && !!session.data?.connected })
  useEffect(() => { if (!environmentId && project.data?.project.environments.length === 1) setEnvironmentId(project.data.project.environments[0]!.id) }, [environmentId, project.data])
  const create = useMutation({ mutationFn: api.create, onSuccess: data => { setService(data.service); setCreatedAt(Date.now()); setImage(data.image); setMobileCreate(false); setUncertain(false); cache.invalidateQueries({ queryKey: ['project', projectId] }) }, onError: error => { setFormError(message(error)); if (error instanceof AppError && error.kind === 'uncertain') setUncertain(true) } })
  const disconnect = useMutation({ mutationFn: api.disconnect, onSuccess: () => { cache.clear(); setProjectId(''); setEnvironmentId(''); setService(null); setImage(''); setName(''); setUncertain(false); cache.setQueryData(['session'], { connected: false }) } })

  function submitCreate(event: React.FormEvent) {
    event.preventDefault()
    const parsedImage = imageSchema.safeParse(image)
    const parsedName = name ? serviceNameSchema.safeParse(name) : null
    if (!parsedImage.success) { setFormError(parsedImage.error.issues[0]?.message ?? 'Enter a valid public image.'); return }
    if (parsedName && !parsedName.success) { setFormError(parsedName.error.issues[0]?.message ?? 'Enter a valid service name.'); return }
    if (!projectId || !environmentId) { setFormError('Select a project and environment.'); return }
    setFormError('')
    create.mutate({ projectId, environmentId, image: parsedImage.data, ...(parsedName?.success ? { name: parsedName.data } : {}) })
  }

  return <>
    <a className="skip-link" href="#main">Skip to main content</a>
    <header className="site-header"><div className="header-inner"><strong className="brand">Lifecycle</strong><div className="header-actions"><button className="text-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} type="button">{theme === 'light' ? 'Dark theme' : 'Light theme'}</button>{session.data?.connected && <button className="text-button" type="button" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>Disconnect</button>}</div></div></header>
    <main id="main" className="workspace">
      {session.isLoading && <p role="status">Checking connection...</p>}
      {session.isError && <p role="alert">{message(session.error)} <button type="button" onClick={() => session.refetch()}>Retry</button></p>}
      {session.data && !session.data.connected && <Connection onConnected={data => cache.setQueryData(['session'], data)} />}
      {session.data?.connected && <>
        <div className="context-heading"><div><h1>Container lifecycle</h1><p>Create a service from a public image and follow what Railway reports.</p></div><span className="connection-label">Railway connected</span></div>
        <section className="context-controls" aria-label="Railway context">
          {session.data.type === 'account' && <label>Project<select value={projectId} onChange={event => { setProjectId(event.target.value); setEnvironmentId(''); setService(null) }}><option value="">Select project</option>{projects.data?.projects.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
          {session.data.type === 'project' && <div className="context-readonly"><span>Project</span><strong>{project.data?.project.name ?? 'Loading...'}</strong></div>}
          {session.data.type === 'account' && <label>Environment<select value={environmentId} onChange={event => { setEnvironmentId(event.target.value); setService(null) }} disabled={!project.data}><option value="">Select environment</option>{project.data?.project.environments.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
          {session.data.type === 'project' && <div className="context-readonly"><span>Environment</span><strong>{project.data?.project.environments[0]?.name ?? 'Loading...'}</strong></div>}
          {project.isError && <p role="alert">{message(project.error)}</p>}
        </section>
        {projectId && environmentId && <div className="layout">
          <aside ref={createPanel} className={`control-rail ${mobileCreate ? 'mobile-open' : ''}`} aria-label="Container controls" role={mobileCreate ? 'dialog' : undefined} aria-modal={mobileCreate ? true : undefined}>
            <div className="rail-heading"><div><h2>New service</h2><p>Deploy a public container image.</p></div><button className="text-button mobile-only" onClick={() => setMobileCreate(false)} type="button">Close</button></div>
            <form onSubmit={submitCreate} noValidate>
              <label htmlFor="image">Public container image</label><input id="image" value={image} onChange={event => setImage(event.target.value)} placeholder="nginx:stable-alpine" autoComplete="off" aria-describedby="image-help" required />
              <p id="image-help" className="field-help">Use a public Docker image reference.</p>
              <label htmlFor="name">Service name <span className="optional">Optional</span></label><input id="name" value={name} onChange={event => setName(event.target.value)} placeholder="web-preview" autoComplete="off" />
              <p className="field-help">Leave blank for an automatic name.</p>
              {formError && <p className="inline-error" role="alert">{formError}</p>}
              {uncertain && <div className="uncertain"><p>The create request may have reached Railway. Check the service list before launching again.</p><button type="button" onClick={async () => { await project.refetch(); setUncertain(false) }}>Refresh services</button></div>}
              <button className="primary-button" type="submit" disabled={create.isPending || uncertain}>{create.isPending ? 'Creating service...' : 'Launch container'}</button>
            </form>
            <div className="existing"><h3>Services</h3>{project.data?.project.services.length ? <ul>{project.data.project.services.map(item => <li key={item.id}><button type="button" className={service?.id === item.id ? 'selected-service' : ''} onClick={() => { setService(item); setCreatedAt(undefined); setMobileCreate(false) }}>{item.name}</button></li>)}</ul> : <p>No services in this project.</p>}</div>
          </aside>
          <div className="work-surface" inert={mobileCreate}><button ref={openCreateButton} className="mobile-launch mobile-only" type="button" onClick={() => setMobileCreate(true)}>Configure container</button>{service ? <DeploymentView key={`${service.id}:${environmentId}`} service={service} projectId={projectId} environmentId={environmentId} image={image} createdAt={createdAt} onDeleted={() => { setService(null); project.refetch() }} /> : <section className="empty-state"><h2>No deployment selected</h2><p>Launch a public image or select a service to inspect its latest deployment.</p></section>}</div>
        </div>}
      </>}
    </main>
  </>
}

function Connection({ onConnected }: { onConnected: (data: Awaited<ReturnType<typeof api.connect>>) => void }) {
  const [type, setType] = useState<'project' | 'account'>('project')
  const [token, setToken] = useState('')
  const connect = useMutation({ mutationFn: () => api.connect(type, token), onSuccess: data => { setToken(''); onConnected(data) } })
  return <div className="disconnected"><div className="intro"><h1>Container lifecycle</h1><p>Run a public container image on Railway. See the deployment state, read its logs, and stop the workload when you are done.</p><div className="product-preview" aria-hidden="true"><div className="preview-heading"><div><strong>web-preview</strong><code>nginx:stable-alpine</code></div><span>Running</span></div><ol><li>Created</li><li>Queued</li><li>Building</li><li>Deploying</li><li className="preview-current">Running</li></ol><pre><span>12:04:18</span>  Container started on port 8080</pre></div><p className="intro-note">Deployments remain in your Railway project.</p></div><form className="connection-form" onSubmit={event => { event.preventDefault(); connect.mutate() }}><h2>Connect Railway</h2><p className="form-intro">Use a project token for one environment or an account token to choose a project.</p><label htmlFor="token-type">Token type</label><select id="token-type" value={type} onChange={event => setType(event.target.value as 'project' | 'account')}><option value="project">Project token (recommended)</option><option value="account">Account or workspace token</option></select><label htmlFor="token">Railway token</label><input id="token" type="password" value={token} onChange={event => setToken(event.target.value)} autoComplete="off" required /><p className="field-help">The server encrypts your token in a short-lived HttpOnly cookie. It is not saved in browser storage.</p>{connect.isError && <p role="alert" className="inline-error">{message(connect.error)}</p>}<button type="submit" className="primary-button" disabled={connect.isPending || token.trim().length < 16}>{connect.isPending ? 'Checking token...' : 'Connect Railway'}</button></form></div>
}
