import { useEffect, useState } from 'react'
import { Bot } from 'lucide-react'
import { Button, Card, Select, useToast } from '../../components/primitives'
import { getAutoScreen, setAutoScreen, type AutoScreenChannel } from '../../lib/v2/requisitions'

/**
 * Opt-in auto-screen-on-apply config for a requisition. When enabled, a new
 * application to this req auto-creates a screening and (once Vapi is configured)
 * places the voice call and/or SMS — see the auto_screen_on_apply DB trigger and
 * the auto-screen-dispatch edge function. Default OFF.
 */
export function AutoScreenCard({ requisitionId }: { requisitionId: string }) {
  const { toast } = useToast()
  const [on, setOn] = useState(false)
  const [channel, setChannel] = useState<AutoScreenChannel>('both')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let live = true
    getAutoScreen(requisitionId).then((c) => {
      if (!live) return
      setOn(c.auto_screen)
      setChannel(c.auto_screen_channel)
      setLoading(false)
    })
    return () => {
      live = false
    }
  }, [requisitionId])

  async function save() {
    setBusy(true)
    const { error } = await setAutoScreen(requisitionId, { auto_screen: on, auto_screen_channel: channel })
    setBusy(false)
    if (error) {
      toast({ tone: 'error', title: 'Save failed', description: error })
      return
    }
    setDirty(false)
    toast({ tone: 'success', title: on ? 'Auto-screen enabled' : 'Auto-screen disabled' })
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-muted" />
          <h2 className="text-sm font-semibold tracking-tight text-ink">Auto-screen on apply</h2>
        </div>
        {dirty && (
          <Button size="sm" loading={busy} onClick={save}>
            Save
          </Button>
        )}
      </div>
      {loading ? (
        <p className="mt-3 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => {
                setOn(e.target.checked)
                setDirty(true)
              }}
              className="h-4 w-4 rounded border-line"
            />
            Automatically screen new applicants to this requisition
          </label>
          <div className="max-w-xs">
            <Select
              label="Outreach channel"
              value={channel}
              onChange={(e) => {
                setChannel(e.target.value as AutoScreenChannel)
                setDirty(true)
              }}
              disabled={!on}
              options={[
                { value: 'both', label: 'Voice call + SMS' },
                { value: 'phone', label: 'Voice call only' },
                { value: 'sms', label: 'SMS only' },
              ]}
            />
          </div>
          <p className="text-xs text-muted">
            On a new application, a screening is created from this req's question set and the AI agent reaches out
            (with an AI disclosure). Requires Vapi to be configured; until then, the screening is created and left
            ready for manual dispatch.
          </p>
        </div>
      )}
    </Card>
  )
}
