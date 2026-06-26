import { useEffect, useMemo, useState } from 'react'
import {
  Search, Plus, Plug, CheckCircle2, AlertTriangle, RefreshCw, Trash2, Link2, Copy, Loader2, X,
} from 'lucide-react'
import { Modal, Spinner, EmptyState } from '../components/ui'
import {
  PROVIDERS, CATEGORY_LABELS, AUTH_LABELS, SYNC_FREQUENCIES, TRANSFORM_RULES, ATS_TARGET_FIELDS,
  listIntegrations, connectIntegration, disconnectIntegration, removeIntegration, updateIntegration,
  testConnection, runSync, listLogs, listMappings, saveMappings, webhookUrlFor, getProvider,
  type Integration, type IntegrationCategory, type ProviderDef, type AuthType, type SyncDirection,
  type IntegrationLog, type FieldMapping,
} from '../lib/integrations'

const STATUS_STYLE: Record<Integration['status'], string> = {
  connected: 'bg-sage-100 text-sage-700',
  disconnected: 'bg-brand-50 text-muted',
  error: 'bg-rust-50 text-rust-500',
  pending: 'bg-clay-50 text-clay-600',
}

export function Integrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<IntegrationCategory | 'all'>('all')
  const [connect, setConnect] = useState<ProviderDef | 'custom' | null>(null)
  const [detail, setDetail] = useState<Integration | null>(null)

  async function load() {
    setLoading(true)
    setIntegrations(await listIntegrations())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const byProvider = useMemo(() => {
    const m = new Map<string, Integration>()
    for (const i of integrations) if (!m.has(i.provider) || i.status === 'connected') m.set(i.provider, i)
    return m
  }, [integrations])

  const categories = useMemo(() => Array.from(new Set(PROVIDERS.map((p) => p.category))), [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return PROVIDERS.filter((p) => {
      if (cat !== 'all' && p.category !== cat) return false
      if (!needle) return true
      return p.name.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle)
    })
  }, [q, cat])

  // Custom integrations the admin built (not in the static catalog) get their own cards.
  const customOnes = integrations.filter((i) => !getProvider(i.provider) || i.provider.startsWith('custom'))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Integrations</h1>
          <p className="text-sm text-muted">Connect job boards, HRIS, payroll, background checks, calendars, and more.</p>
        </div>
        <div className="flex gap-2">
          <a className="btn-secondary" href="#/api-docs"><Link2 size={15} /> API & webhooks</a>
          <button className="btn-primary" onClick={() => setConnect('custom')}><Plus size={16} /> Custom integration</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', ...categories] as (IntegrationCategory | 'all')[]).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
              cat === c ? 'bg-ink text-paper ring-ink' : 'bg-surface text-muted ring-line hover:bg-paper'
            }`}
          >
            {c === 'all' ? 'All' : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-2.5 text-muted" />
        <input className="input pl-9" placeholder="Search integrations…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <Spinner label="Loading integrations…" />
      ) : (
        <>
          {customOnes.length > 0 && cat === 'all' && !q && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Your integrations</div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {customOnes.map((i) => (
                  <ConnectedCard key={i.id} integration={i} onOpen={() => setDetail(i)} />
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => {
              const existing = byProvider.get(p.provider)
              return (
                <div key={p.provider} className="card flex flex-col p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-paper text-xl ring-1 ring-line">{p.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-ink">{p.name}</div>
                        {existing && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[existing.status]}`}>
                            {existing.status}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] uppercase tracking-wide text-muted">{CATEGORY_LABELS[p.category]}</div>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 flex-1 text-xs text-muted">{p.description}</p>
                  <div className="mt-3 flex gap-2">
                    {existing && existing.status === 'connected' ? (
                      <button className="btn-secondary flex-1 py-1.5" onClick={() => setDetail(existing)}>Configure</button>
                    ) : (
                      <button className="btn-primary flex-1 py-1.5" onClick={() => setConnect(p)}>
                        <Plug size={14} /> Connect
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {filtered.length === 0 && <EmptyState title="No integrations match" hint="Try a different category or search." />}
        </>
      )}

      {connect && (
        <ConnectModal
          provider={connect === 'custom' ? null : connect}
          onClose={() => setConnect(null)}
          onConnected={() => { setConnect(null); load() }}
        />
      )}
      {detail && (
        <DetailModal
          integration={detail}
          onClose={() => setDetail(null)}
          onChanged={async () => { await load() }}
          onClosed={() => { setDetail(null); load() }}
        />
      )}
    </div>
  )
}

function ConnectedCard({ integration, onOpen }: { integration: Integration; onOpen: () => void }) {
  const p = getProvider(integration.provider)
  return (
    <button onClick={onOpen} className="card flex items-center gap-3 p-4 text-left hover:shadow-md">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-paper text-xl ring-1 ring-line">{p?.icon ?? '🔌'}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-ink">{integration.name}</div>
        <div className="text-[11px] uppercase tracking-wide text-muted">{CATEGORY_LABELS[integration.category]}</div>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[integration.status]}`}>{integration.status}</span>
    </button>
  )
}

const AUTH_OPTIONS: AuthType[] = ['api_key', 'bearer', 'oauth2', 'basic', 'webhook_secret', 'custom_header', 'none']
const DIRECTIONS: SyncDirection[] = ['inbound', 'outbound', 'bidirectional']

function ConnectModal({ provider, onClose, onConnected }: {
  provider: ProviderDef | null
  onClose: () => void
  onConnected: () => void
}) {
  const isCustom = !provider
  const [name, setName] = useState(provider?.name ?? '')
  const [baseUrl, setBaseUrl] = useState('')
  const [authType, setAuthType] = useState<AuthType>(provider?.authType ?? 'api_key')
  const [direction, setDirection] = useState<SyncDirection>(provider?.defaultDirection ?? 'bidirectional')
  const [frequency, setFrequency] = useState('manual')
  const [creds, setCreds] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setCred = (k: string, v: string) => setCreds((c) => ({ ...c, [k]: v }))
  const pdef: ProviderDef = provider ?? {
    provider: 'custom_rest', name: name || 'Custom integration', category: 'custom',
    description: '', icon: '🔌', authType, defaultDirection: direction,
  }

  async function save() {
    if (!name.trim()) { setError('Give the integration a name.'); return }
    setSaving(true); setError(null)
    const { error } = await connectIntegration({
      provider: { ...pdef, authType },
      name, base_url: baseUrl || undefined, auth_type: authType,
      sync_direction: direction, sync_frequency: frequency,
      credentials: Object.keys(creds).length ? creds : undefined,
    })
    setSaving(false)
    if (error) { setError(error); return }
    onConnected()
  }

  return (
    <Modal title={isCustom ? 'Build custom integration' : `Connect ${provider!.name}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Indeed (Production)" />
          </div>
          <div>
            <label className="label">Authentication</label>
            <select className="input" value={authType} onChange={(e) => setAuthType(e.target.value as AuthType)}>
              {AUTH_OPTIONS.map((a) => <option key={a} value={a}>{AUTH_LABELS[a]}</option>)}
            </select>
          </div>
        </div>

        {(isCustom || authType === 'custom_header') && (
          <div>
            <label className="label">Base API URL</label>
            <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
          </div>
        )}

        <CredentialFields authType={authType} creds={creds} setCred={setCred} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Sync direction</label>
            <select className="input" value={direction} onChange={(e) => setDirection(e.target.value as SyncDirection)}>
              {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Sync frequency</label>
            <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {SYNC_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        {authType === 'webhook_secret' && (
          <WebhookBox provider={pdef.provider} />
        )}

        <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-muted">
          🔒 Credentials are stored write-only (Supabase, separate table with no read access) and used only by
          server-side Edge Functions — they are never returned to the browser.
        </p>

        {error && <div className="rounded-lg bg-rust-50 px-3 py-2 text-sm text-rust-500">{error}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />} Connect
          </button>
        </div>
      </div>
    </Modal>
  )
}

function CredentialFields({ authType, creds, setCred }: {
  authType: AuthType; creds: Record<string, string>; setCred: (k: string, v: string) => void
}) {
  if (authType === 'none') return null
  if (authType === 'oauth2') {
    return (
      <div className="rounded-lg border border-line bg-paper px-3 py-3 text-sm text-muted">
        OAuth 2.0 — you'll be redirected to authorize on connect (handled by the provider Edge Function). No secret to enter here.
      </div>
    )
  }
  const F = ({ k, label, type = 'text', ph }: { k: string; label: string; type?: string; ph?: string }) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={creds[k] ?? ''} onChange={(e) => setCred(k, e.target.value)} placeholder={ph} autoComplete="off" />
    </div>
  )
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {authType === 'api_key' && <F k="api_key" label="API key" type="password" ph="sk_live_…" />}
      {authType === 'bearer' && <F k="token" label="Bearer token" type="password" />}
      {authType === 'basic' && <><F k="username" label="Username" /><F k="password" label="Password" type="password" /></>}
      {authType === 'webhook_secret' && <F k="signing_secret" label="Signing secret" type="password" />}
      {authType === 'custom_header' && <><F k="header_name" label="Header name" ph="X-Api-Key" /><F k="header_value" label="Header value" type="password" /></>}
    </div>
  )
}

function WebhookBox({ provider }: { provider: string }) {
  const url = webhookUrlFor(provider)
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <label className="label">Inbound webhook URL</label>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg bg-paper px-3 py-2 text-xs text-ink ring-1 ring-inset ring-line">{url}</code>
        <button
          className="btn-secondary py-2"
          onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        >
          {copied ? <CheckCircle2 size={15} className="text-sage-600" /> : <Copy size={15} />}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">Point the provider's webhook here. Events are validated, logged, and queued.</p>
    </div>
  )
}

type Tab = 'overview' | 'mappings' | 'logs'

function DetailModal({ integration, onClose, onChanged, onClosed }: {
  integration: Integration
  onClose: () => void
  onChanged: () => Promise<void>
  onClosed: () => void
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [i, setI] = useState(integration)
  const [logs, setLogs] = useState<IntegrationLog[]>([])
  const [mappings, setMappings] = useState<FieldMapping[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null)

  async function refreshLogs() { setLogs(await listLogs(i.id)) }
  useEffect(() => { refreshLogs(); listMappings(i.id).then(setMappings) }, [i.id])

  async function doTest() {
    setBusy('test'); const r = await testConnection(i); setFlash({ ok: r.ok, msg: r.message }); setBusy(null); refreshLogs(); onChanged()
  }
  async function doSync() {
    setBusy('sync'); const r = await runSync(i); setFlash({ ok: r.ok, msg: r.message }); setBusy(null)
    setI({ ...i, last_sync_at: new Date().toISOString() }); refreshLogs(); onChanged()
  }
  async function saveSettings(patch: Partial<Integration>) {
    await updateIntegration(i.id, patch); setI({ ...i, ...patch }); onChanged()
  }

  const provider = getProvider(i.provider)

  return (
    <Modal title="" onClose={onClose} wide>
      <div className="-mt-2 mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-paper text-2xl ring-1 ring-line">{provider?.icon ?? '🔌'}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">{i.name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[i.status]}`}>{i.status}</span>
          </div>
          <div className="text-xs text-muted">{CATEGORY_LABELS[i.category]} · {AUTH_LABELS[i.auth_type]}</div>
        </div>
      </div>

      {flash && (
        <div className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${flash.ok ? 'bg-sage-50 text-sage-700' : 'bg-rust-50 text-rust-500'}`}>
          {flash.ok ? <CheckCircle2 size={15} className="mt-0.5" /> : <AlertTriangle size={15} className="mt-0.5" />}{flash.msg}
        </div>
      )}

      <div className="mb-4 flex gap-1 border-b border-line">
        {(['overview', 'mappings', 'logs'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize ${tab === t ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {t === 'mappings' ? 'Field mappings' : t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Sync direction</label>
              <select className="input" value={i.sync_direction} onChange={(e) => saveSettings({ sync_direction: e.target.value as SyncDirection })}>
                {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Sync frequency</label>
              <select className="input" value={i.sync_frequency} onChange={(e) => saveSettings({ sync_frequency: e.target.value })}>
                {SYNC_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
          {i.base_url && (
            <div><label className="label">Base URL</label><code className="block truncate rounded-lg bg-paper px-3 py-2 text-xs ring-1 ring-inset ring-line">{i.base_url}</code></div>
          )}
          <WebhookBox provider={i.provider} />
          <div className="text-xs text-muted">
            Last sync: {i.last_sync_at ? new Date(i.last_sync_at).toLocaleString() : 'never'}
            {i.credentials_reference && <> · 🔒 credentials stored</>}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button className="btn-secondary" onClick={doTest} disabled={busy === 'test'}>
              {busy === 'test' ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />} Test connection
            </button>
            <button className="btn-secondary" onClick={doSync} disabled={busy === 'sync'}>
              {busy === 'sync' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Sync now
            </button>
            <div className="ml-auto flex gap-2">
              <button className="btn-secondary" onClick={async () => { await disconnectIntegration(i); onClosed() }}>Disconnect</button>
              <button className="rounded-lg border border-rust-200 px-3 py-2 text-sm font-medium text-rust-500 hover:bg-rust-50" onClick={async () => { if (confirm('Remove this integration and its logs?')) { await removeIntegration(i); onClosed() } }}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'mappings' && (
        <MappingsEditor
          mappings={mappings}
          onChange={setMappings}
          onSave={async () => { await saveMappings(i.id, mappings); setFlash({ ok: true, msg: 'Field mappings saved.' }) }}
        />
      )}

      {tab === 'logs' && (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted">No activity yet.</div>
          ) : logs.map((l) => (
            <div key={l.id} className="flex items-start gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              {l.status === 'error' ? <AlertTriangle size={15} className="mt-0.5 text-rust-500" /> : <CheckCircle2 size={15} className="mt-0.5 text-sage-600" />}
              <div className="flex-1">
                <div className="font-medium text-ink">{l.event_type} <span className="font-normal text-muted">· {l.status}</span></div>
                <div className="text-xs text-muted">{l.message}</div>
              </div>
              <div className="shrink-0 text-[11px] text-muted">{new Date(l.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function MappingsEditor({ mappings, onChange, onSave }: {
  mappings: FieldMapping[]
  onChange: (m: FieldMapping[]) => void
  onSave: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const update = (idx: number, patch: Partial<FieldMapping>) =>
    onChange(mappings.map((m, i) => (i === idx ? { ...m, ...patch } : m)))
  const add = () => onChange([...mappings, { source_field: '', target_field: ATS_TARGET_FIELDS[0].fields[0], transformation_rule: 'none', is_required: false }])
  const remove = (idx: number) => onChange(mappings.filter((_, i) => i !== idx))

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Map external fields to ATS fields, with optional transforms applied on import.</p>
      <div className="space-y-2">
        {mappings.map((m, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <input className="input flex-1" placeholder="external_field" value={m.source_field} onChange={(e) => update(idx, { source_field: e.target.value })} />
            <span className="text-muted">→</span>
            <select className="input flex-1" value={m.target_field} onChange={(e) => update(idx, { target_field: e.target.value })}>
              {ATS_TARGET_FIELDS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.fields.map((f) => <option key={f} value={f}>{f}</option>)}
                </optgroup>
              ))}
            </select>
            <select className="input w-28" value={m.transformation_rule ?? 'none'} onChange={(e) => update(idx, { transformation_rule: e.target.value })}>
              {TRANSFORM_RULES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={m.is_required} onChange={(e) => update(idx, { is_required: e.target.checked })} /> req</label>
            <button className="text-muted hover:text-rust-500" onClick={() => remove(idx)}><X size={15} /></button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button className="btn-secondary py-1.5" onClick={add}><Plus size={15} /> Add mapping</button>
        <button className="btn-primary" onClick={async () => { setSaving(true); await onSave(); setSaving(false) }} disabled={saving}>
          {saving ? 'Saving…' : 'Save mappings'}
        </button>
      </div>
    </div>
  )
}
