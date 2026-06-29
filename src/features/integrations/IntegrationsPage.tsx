import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Plug, Power } from 'lucide-react'
import { Button, Card, Badge, Input, Select, Modal, useToast } from '../../components/primitives'
import type { BadgeTone } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import {
  listIntegrations,
  createIntegration,
  updateIntegration,
  setEnabled,
  setStatus,
  deleteIntegration,
  type IntegrationInput,
} from '../../lib/v2/integrations'
import type { Integration, IntegrationStatus } from '../../lib/v2/types'

// TODO: integration_credentials are write-only (no SELECT policy), so credential
// capture (api keys / oauth secrets) is deferred to a later pass. This page only
// manages the integration record + enabled/status flags, not the secret material.

const STATUS_TONE: Record<IntegrationStatus, BadgeTone> = {
  connected: 'sage',
  pending: 'clay',
  error: 'rust',
  disconnected: 'neutral',
}

const AUTH_TYPE_OPTIONS = [
  { value: 'api_key', label: 'API key' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'oauth2', label: 'OAuth 2.0' },
  { value: 'basic', label: 'Basic auth' },
  { value: 'webhook_secret', label: 'Webhook secret' },
  { value: 'custom_header', label: 'Custom header' },
  { value: 'none', label: 'None' },
]

const SYNC_DIRECTION_OPTIONS = [
  { value: 'inbound', label: 'Inbound' },
  { value: 'outbound', label: 'Outbound' },
  { value: 'bidirectional', label: 'Bidirectional' },
]

export function IntegrationsPage() {
  const { toast } = useToast()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<Integration | null | undefined>(undefined)

  function load() {
    setLoading(true)
    listIntegrations().then((rows) => {
      setIntegrations(rows)
      setLoading(false)
    })
  }
  useEffect(load, [])

  const rollup = useMemo(
    () => ({
      total: integrations.length,
      connected: integrations.filter((i) => i.status === 'connected').length,
      enabled: integrations.filter((i) => i.is_enabled).length,
    }),
    [integrations],
  )

  async function toggleEnabled(i: Integration) {
    const { error } = await setEnabled(i.id, !i.is_enabled)
    if (error) toast({ tone: 'error', title: 'Update failed', description: error })
    else {
      toast({ tone: 'success', title: i.is_enabled ? 'Integration disabled' : 'Integration enabled' })
      load()
    }
  }

  async function toggleConnected(i: Integration) {
    const next: IntegrationStatus = i.status === 'connected' ? 'disconnected' : 'connected'
    const { error } = await setStatus(i.id, next)
    if (error) toast({ tone: 'error', title: 'Update failed', description: error })
    else {
      toast({ tone: 'success', title: next === 'connected' ? 'Marked connected' : 'Marked disconnected' })
      load()
    }
  }

  async function remove(i: Integration) {
    const { error } = await deleteIntegration(i.id)
    if (error) toast({ tone: 'error', title: 'Delete failed', description: error })
    else {
      toast({ tone: 'success', title: 'Integration removed' })
      load()
    }
  }

  if (loading) return <Spinner label="Loading integrations…" />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Integrations</h1>
          <p className="mt-1 text-sm text-muted">Connect job boards, HRIS, and sourcing tools.</p>
        </div>
        <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setEdit(null)}>
          Add integration
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Integrations" value={rollup.total} hint="total configured" />
        <StatCard
          label="Connected"
          value={rollup.connected}
          tone={rollup.connected > 0 ? 'good' : 'default'}
          hint="status = connected"
        />
        <StatCard label="Enabled" value={rollup.enabled} hint={`of ${rollup.total}`} />
      </div>

      {integrations.length === 0 ? (
        <EmptyState title="No integrations yet" hint="Add an integration to start syncing data." />
      ) : (
        <div className="space-y-3">
          {integrations.map((i) => (
            <Card key={i.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-muted">
                    <Plug size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{i.name}</span>
                      <Badge tone={STATUS_TONE[i.status]}>{i.status}</Badge>
                    </div>
                    <p className="text-xs text-muted">
                      {i.provider} · {i.category}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant={i.is_enabled ? 'primary' : 'secondary'}
                    leftIcon={<Power size={14} />}
                    onClick={() => toggleEnabled(i)}
                  >
                    {i.is_enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => toggleConnected(i)}>
                    {i.status === 'connected' ? 'Mark disconnected' : 'Mark connected'}
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEdit(i)}>
                    <Pencil size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => remove(i)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {edit !== undefined && (
        <IntegrationForm
          existing={edit}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined)
            load()
          }}
        />
      )}
    </div>
  )
}

function IntegrationForm({
  existing,
  onClose,
  onSaved,
}: {
  existing: Integration | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState(existing?.name ?? '')
  const [provider, setProvider] = useState(existing?.provider ?? '')
  const [category, setCategory] = useState(existing?.category ?? '')
  const [baseUrl, setBaseUrl] = useState((existing as { base_url?: string | null } | null)?.base_url ?? '')
  const [webhookUrl, setWebhookUrl] = useState(
    (existing as { webhook_url?: string | null } | null)?.webhook_url ?? '',
  )
  const [authType, setAuthType] = useState(existing?.auth_type ?? 'api_key')
  const [syncDirection, setSyncDirection] = useState(existing?.sync_direction ?? 'inbound')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim() || !provider.trim() || !category.trim()) {
      toast({ tone: 'error', title: 'Name, provider, and category are required' })
      return
    }
    setSaving(true)
    const input: IntegrationInput = {
      name: name.trim(),
      provider: provider.trim(),
      category: category.trim(),
      auth_type: authType,
      sync_direction: syncDirection,
      base_url: baseUrl.trim() || null,
      webhook_url: webhookUrl.trim() || null,
    }
    const { error } = existing
      ? await updateIntegration(existing.id, input)
      : await createIntegration(input)
    setSaving(false)
    if (error) toast({ tone: 'error', title: 'Save failed', description: error })
    else {
      toast({ tone: 'success', title: existing ? 'Integration updated' : 'Integration added' })
      onSaved()
    }
  }

  return (
    <Modal
      title={existing ? `Edit ${existing.name}` : 'Add integration'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={save}>
            {existing ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Indeed" />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="e.g. indeed"
          />
          <Input
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. job_board"
          />
        </div>
        <Input
          label="Base URL"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.example.com (optional)"
        />
        <Input
          label="Webhook URL"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://… (optional)"
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Auth type"
            value={authType}
            onChange={(e) => setAuthType(e.target.value)}
            options={AUTH_TYPE_OPTIONS}
          />
          <Select
            label="Sync direction"
            value={syncDirection}
            onChange={(e) => setSyncDirection(e.target.value)}
            options={SYNC_DIRECTION_OPTIONS}
          />
        </div>
      </div>
    </Modal>
  )
}
