import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react'
import { Button, Card, Badge, Input, Modal, useToast } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import {
  listFacilities,
  createFacility,
  updateFacility,
  deleteFacility,
  type FacilityRow,
  type FacilityInput,
} from '../../lib/v2/facilities'

export function FacilitiesPage() {
  const { toast } = useToast()
  const [facilities, setFacilities] = useState<FacilityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<FacilityRow | null | undefined>(undefined)

  function load() {
    setLoading(true)
    listFacilities().then((rows) => {
      setFacilities(rows)
      setLoading(false)
    })
  }
  useEffect(load, [])

  const stats = useMemo(() => {
    const regions = new Set(facilities.map((f) => f.region).filter(Boolean) as string[])
    return {
      total: facilities.length,
      active: facilities.filter((f) => f.active).length,
      regions: regions.size,
    }
  }, [facilities])

  async function remove(f: FacilityRow) {
    const { error } = await deleteFacility(f.id)
    if (error) toast({ tone: 'error', title: 'Delete failed', description: error })
    else {
      toast({ tone: 'success', title: 'Facility removed' })
      load()
    }
  }

  if (loading) return <Spinner label="Loading facilities…" />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Facilities</h1>
          <p className="mt-1 text-sm text-muted">SNF/LTC facilities your team covers.</p>
        </div>
        <Button leftIcon={<Plus size={15} />} onClick={() => setEdit(null)}>
          New facility
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Facilities" value={stats.total} />
        <StatCard label="Active" value={stats.active} tone="good" hint={`of ${stats.total}`} />
        <StatCard label="Regions" value={stats.regions} hint="distinct" />
      </div>

      {facilities.length === 0 ? (
        <EmptyState title="No facilities yet" hint="Add a facility to start tracking coverage." />
      ) : (
        <div className="space-y-3">
          {facilities.map((f) => {
            const place = [f.city, f.state].filter(Boolean).join(', ')
            return (
              <Card key={f.id} className="flex items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Building2 size={16} className="shrink-0 text-muted" aria-hidden />
                    <span className="font-semibold text-ink">{f.name}</span>
                    {f.region && <Badge tone="neutral">{f.region}</Badge>}
                    <Badge tone={f.active ? 'sage' : 'neutral'}>{f.active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  {place && <p className="mt-1 text-sm text-muted">{place}</p>}
                  {f.address && <p className="mt-0.5 text-xs text-muted">{f.address}</p>}
                </div>
                <div className="inline-flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEdit(f)}>
                    <Pencil size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove(f)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {edit !== undefined && (
        <FacilityForm
          facility={edit}
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

function FacilityForm({
  facility,
  onClose,
  onSaved,
}: {
  facility: FacilityRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState(facility?.name ?? '')
  const [state, setState] = useState(facility?.state ?? '')
  const [city, setCity] = useState(facility?.city ?? '')
  const [address, setAddress] = useState(facility?.address ?? '')
  const [region, setRegion] = useState(facility?.region ?? '')
  const [active, setActive] = useState(facility?.active ?? true)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) {
      toast({ tone: 'error', title: 'Name is required' })
      return
    }
    setSaving(true)
    const input: FacilityInput = {
      name: name.trim(),
      state: state.trim() || null,
      city: city.trim() || null,
      address: address.trim() || null,
      region: region.trim() || null,
      active,
    }
    const { error } = facility
      ? await updateFacility(facility.id, input)
      : await createFacility(input)
    setSaving(false)
    if (error) toast({ tone: 'error', title: 'Save failed', description: error })
    else {
      toast({ tone: 'success', title: facility ? 'Facility updated' : 'Facility added' })
      onSaved()
    }
  }

  return (
    <Modal
      title={facility ? 'Edit facility' : 'New facility'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={save}>
            {facility ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Facility name" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
          <Input label="State" value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g. TX" />
        </div>
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" />
        <Input label="Region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Coverage region" />
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-line text-sage-600 focus:ring-ink/30"
          />
          Active
        </label>
      </div>
    </Modal>
  )
}
