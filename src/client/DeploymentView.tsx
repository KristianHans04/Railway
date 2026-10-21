import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Deployment, LogLine, Service } from '../shared/domain'
import { lifecycle } from '../shared/domain'
import { diagnostics } from '../shared/diagnostics'
import { api, AppError } from './api'

type Props = { service: Service; projectId: string; environmentId: string; image: string; createdAt?: number; onDeleted: () => void }
const phases = ['Created', 'Queued', 'Building', 'Deploying', 'Running']
const message = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'

export function DeploymentView({ service, projectId, environmentId, image, createdAt, onDeleted }: Props) {
  const cache = useQueryClient()
  const [actionError, setActionError] = useState('')
  const [actionPending, setActionPending] = useState<'stop' | 'restart' | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [observed, setObserved] = useState<{ status: string; at: string }[]>([])
  const [copyStatus, setCopyStatus] = useState('')
  const [allLogs, setAllLogs] = useState<LogLine[]>([])
  const [deployUncertain, setDeployUncertain] = useState(false)
  const list = useQuery({ queryKey: ['deployments', service.id, environmentId], queryFn: () => api.deployments(service.id, projectId, environmentId), refetchInterval: 120000 })
  const deployment = list.data?.deployments[0] ?? null
  const current: Deployment | null = deployment
  const state = lifecycle(current?.status ?? null)
  useEffect(() => {
    if (!current) return
    setObserved(events => events.at(-1)?.status === current.status ? events : [...events.slice(-19), { status: current.status, at: new Date().toISOString() }])
  }, [current?.status, current?.id])
  const action = useMutation({ mutationFn: (name: 'stop' | 'restart') => api.action(current!.id, name, service.id, projectId, environmentId), onMutate: name => { setActionError(''); setActionPending(name) }, onSuccess: async () => { await list.refetch(); setActionPending(null) }, onError: async error => { setActionError(message(error)); if (error instanceof AppError && error.kind === 'uncertain') await list.refetch(); setActionPending(null) } })
  const deploy = useMutation({ mutationFn: () => api.deploy(service.id, projectId, environmentId), onSuccess: async () => { setDeployUncertain(false); await list.refetch() }, onError: error => { setActionError(message(error)); if (error instanceof AppError && error.kind === 'uncertain') setDeployUncertain(true) } })
  const deletion = useMutation({ mutationFn: () => api.delete(service.id, projectId, environmentId, confirmName), onSuccess: () => { cache.removeQueries({ queryKey: ['deployments', service.id] }); onDeleted() } })

  async function copy() {
    try { await navigator.clipboard.writeText(diagnostics({ serviceId: service.id, deployment: current, logs: allLogs })); setCopyStatus('Diagnostics copied.') }
    catch { setCopyStatus('Clipboard unavailable. Select and copy the diagnostics manually.') }
  }

  return <article className="deployment">
    <div className="deployment-heading"><div><h2>{service.name}</h2>{image && <p className="image-name">{image}</p>}</div><div className="deployment-state"><span className={`status status-${state.tone}`} role="status">{state.label}</span><p className="state-explanation">{state.explanation}</p></div></div>
    {list.isError && <p role="alert" className="inline-error">{message(list.error)} <button type="button" onClick={() => list.refetch()}>Retry</button></p>}
    {list.data && !current && <div className="no-deployment"><p>Railway has not reported a deployment in this environment.</p>{(!createdAt || Date.now() - createdAt >= 120000) && <button type="button" disabled={deploy.isPending || deployUncertain} onClick={() => deploy.mutate()}>{deploy.isPending ? 'Requesting deployment...' : 'Deploy in this environment'}</button>}{createdAt && Date.now() - createdAt < 120000 && <p>Refresh after Railway has had time to create it. A manual deploy becomes available if it still has not appeared.</p>}{deployUncertain && <button type="button" onClick={async () => { await list.refetch(); setDeployUncertain(false) }}>Refresh before retrying</button>}</div>}
    <div className="identity desktop-identity"><div><span>Service ID</span><code>{service.id}</code></div><div><span>Deployment ID</span><code>{current?.id ?? 'Waiting for Railway'}</code></div>{current && <div><span>Created</span><time dateTime={current.createdAt}>{new Date(current.createdAt).toLocaleString()}</time></div>}</div>
    <details className="mobile-identity"><summary>Deployment details</summary><div className="identity"><div><span>Service ID</span><code>{service.id}</code></div><div><span>Deployment ID</span><code>{current?.id ?? 'Waiting for Railway'}</code></div>{current && <div><span>Created</span><time dateTime={current.createdAt}>{new Date(current.createdAt).toLocaleString()}</time></div>}</div></details>
    {(state.stop || state.restart || actionPending || actionError) && <section className="actions" aria-label="Deployment actions"><h3>Controls</h3><div className="action-row">{state.stop && <button type="button" onClick={() => action.mutate('stop')} disabled={action.isPending}>{actionPending === 'stop' ? 'Sending stop request...' : 'Stop deployment'}</button>}{state.restart && <button type="button" onClick={() => action.mutate('restart')} disabled={action.isPending}>{actionPending === 'restart' ? 'Sending restart request...' : 'Restart process'}</button>}</div>{actionPending && <p role="status">Railway is processing the {actionPending} request. Waiting for the reported state.</p>}{actionError && <p className="inline-error" role="alert">{actionError}</p>}</section>}
    <section className="lifecycle-section" aria-labelledby="lifecycle-title"><div className="section-heading"><h3 id="lifecycle-title">Lifecycle</h3><div className="lifecycle-tools"><button type="button" className="text-button" onClick={copy}>Copy diagnostics</button><button type="button" className="text-button" onClick={() => list.refetch()}>Refresh state</button></div></div>{copyStatus && <p role="status">{copyStatus}</p>}<ol className="phase-list">{phases.map((phase, index) => <li key={phase} className={state.phase === phase.toLowerCase() ? 'current-phase' : ''}><span className="phase-number">{String(index + 1).padStart(2, '0')}</span><span>{phase}</span></li>)}</ol>{observed.length > 0 && <details className="observed"><summary>Observed state changes</summary><ol>{observed.map((event, index) => <li key={`${event.at}-${index}`}><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time> Railway reported {event.status}</li>)}</ol></details>}</section>
    {current && <LogPanel deployment={current} serviceId={service.id} projectId={projectId} environmentId={environmentId} onLines={setAllLogs} />}
    <details className="danger-zone" open={showDelete} onToggle={event => setShowDelete(event.currentTarget.open)}><summary>Delete service</summary><p>Deleting <strong>{service.name}</strong> removes this service and its deployments. This cannot be undone.</p><label htmlFor="confirm-name">Type the exact service name</label><input id="confirm-name" value={confirmName} onChange={event => setConfirmName(event.target.value)} autoComplete="off" /><button type="button" className="danger-button" disabled={confirmName !== service.name || deletion.isPending} onClick={() => deletion.mutate()}>{deletion.isPending ? 'Deleting...' : 'Delete service'}</button>{deletion.isError && <p role="alert" className="inline-error">{message(deletion.error)}</p>}</details>
  </article>
}

function LogPanel({ deployment, serviceId, projectId, environmentId, onLines }: { deployment: Deployment; serviceId: string; projectId: string; environmentId: string; onLines: (lines: LogLine[]) => void }) {
  const [tab, setTab] = useState<'build' | 'runtime'>('runtime')
  const [lines, setLines] = useState<LogLine[]>([])
  const [following, setFollowing] = useState(true)
  const viewport = useRef<HTMLDivElement>(null)
  const cursor = useRef<string | undefined>(undefined)
  const logs = useQuery({ queryKey: ['logs', deployment.id, tab], queryFn: () => api.logs(deployment.id, serviceId, projectId, environmentId, tab, tab === 'runtime' ? cursor.current : undefined), refetchInterval: 120000 })
  useEffect(() => { setLines([]); cursor.current = undefined; setFollowing(true) }, [deployment.id, tab])
  useEffect(() => {
    if (!logs.data) return
    setLines(previous => {
      const seen = new Set(previous.map(line => `${line.timestamp}:${line.message}`))
      const next = [...previous, ...logs.data!.lines.filter(line => !seen.has(`${line.timestamp}:${line.message}`))].slice(-1000)
      cursor.current = next.at(-1)?.timestamp
      return next
    })
  }, [logs.data, onLines])
  useEffect(() => { onLines(lines) }, [lines, onLines])
  useEffect(() => { if (following && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight }, [lines, following])
  return <section className="logs-section" aria-labelledby="logs-title"><div className="section-heading"><h3 id="logs-title">Logs</h3><div className="log-controls"><button type="button" className={tab === 'runtime' ? 'active-tab' : ''} onClick={() => setTab('runtime')}>Runtime</button><button type="button" className={tab === 'build' ? 'active-tab' : ''} onClick={() => setTab('build')}>Build</button><button type="button" onClick={() => logs.refetch()}>Refresh</button></div></div>{logs.isError && <p role="alert" className="inline-error">Logs unavailable: {message(logs.error)}</p>}{!logs.isError && lines.length === 0 && <p className="log-empty">{logs.isLoading ? 'Loading logs...' : 'No logs have been emitted yet.'}</p>}<div className="log-viewport" ref={viewport} onScroll={event => { const target = event.currentTarget; setFollowing(target.scrollHeight - target.scrollTop - target.clientHeight < 48) }} role="log" aria-label={`${tab} logs`}><pre>{lines.map((line, index) => <span key={`${line.timestamp}-${index}`}><time>{new Date(line.timestamp).toLocaleTimeString()}</time>  {line.message}{'\n'}</span>)}</pre></div>{!following && <button type="button" className="follow-button" onClick={() => { setFollowing(true); if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight }}>Jump to latest</button>}</section>
}
