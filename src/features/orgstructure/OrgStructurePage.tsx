import { useEffect, useMemo, useState } from 'react'
import { Network, Plus, Trash2, Pencil, Check, X, Building2, Layers } from 'lucide-react'
import { Button, Card, useToast } from '../../components/primitives'
import { Spinner, EmptyState } from '../../components/ui'
import {
  listDivisions,
  createDivision,
  renameDivision,
  deleteDivision,
  listDepartments,
  createDepartment,
  deleteDepartment,
  listFacilitiesLite,
  assignFacilityDivision,
  type Division,
  type Department,
  type FacilityLite,
} from '../../lib/v2/hierarchy'

/**
 * Admin "Org structure" — manage the Division → Facility → Department hierarchy.
 * (Role is the existing role_families catalog, picked at requisition time.)
 */
export function OrgStructurePage() {
  const { toast } = useToast()
  const [divisions, setDivisions] = useState<Division[] | null>(null)
  const [facilities, setFacilities] = useState<FacilityLite[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [newDivision, setNewDivision] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  function refresh() {
    listDivisions().then(setDivisions)
    listFacilitiesLite().then(setFacilities)
    listDepartments().then(setDepartments)
  }
  useEffect(refresh, [])

  const deptsByFacility = useMemo(() => {
    const m = new Map<string, Department[]>()
    for (const d of departments) {
      if (!m.has(d.facility_id)) m.set(d.facility_id, [])
      m.get(d.facility_id)!.push(d)
    }
    return m
  }, [departments])

  if (!divisions) return <Spinner label="Loading org structure…" />

  async function addDivision() {
    if (!newDivision.trim()) return
    const { error } = await createDivision(newDivision)
    if (error) toast({ tone: 'error', title: 'Could not add', description: error })
    else { setNewDivision(''); listDivisions().then(setDivisions) }
  }
  async function saveRename(id: string) {
    const { error } = await renameDivision(id, editName)
    if (error) toast({ tone: 'error', title: 'Rename failed', description: error })
    setEditId(null)
    listDivisions().then(setDivisions)
  }
  async function removeDivision(d: Division) {
    if (!confirm(`Delete division "${d.name}"? Facilities stay, but become unassigned.`)) return
    await deleteDivision(d.id)
    refresh()
  }
  async function setFacilityDivision(facilityId: string, divisionId: string | null) {
    setFacilities((p) => p.map((f) => (f.id === facilityId ? { ...f, division_id: divisionId } : f)))
    const { error } = await assignFacilityDivision(facilityId, divisionId)
    if (error) { toast({ tone: 'error', title: 'Update failed', description: error }); refresh() }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
          <Network size={22} className="text-sage-600" /> Org structure
        </h1>
        <p className="mt-1 text-sm text-muted">
          Division → Facility → Department. This drives the cascading pickers on requisitions and the public staffing-request
          page. (Role comes from the role-family catalog.)
        </p>
      </div>

      {/* Divisions */}
      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
          <Layers size={16} className="text-clay-500" /> Divisions
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {divisions.map((d) => (
            <div key={d.id} className="flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-sm">
              {editId === d.id ? (
                <>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-28 bg-transparent text-sm outline-none" autoFocus />
                  <button onClick={() => saveRename(d.id)} className="text-sage-600"><Check size={14} /></button>
                  <button onClick={() => setEditId(null)} className="text-muted"><X size={14} /></button>
                </>
              ) : (
                <>
                  <span className="text-ink">{d.name}</span>
                  <button onClick={() => { setEditId(d.id); setEditName(d.name) }} className="text-muted hover:text-ink"><Pencil size={13} /></button>
                  <button onClick={() => removeDivision(d)} className="text-muted hover:text-rust-500"><Trash2 size={13} /></button>
                </>
              )}
            </div>
          ))}
          <div className="flex items-center gap-1">
            <input
              value={newDivision}
              onChange={(e) => setNewDivision(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDivision()}
              placeholder="New division…"
              className="w-36 rounded-full border border-dashed border-line bg-paper px-3 py-1 text-sm outline-none focus:border-ink"
            />
            <Button onClick={addDivision}><Plus size={14} /></Button>
          </div>
        </div>
        {divisions.length === 0 && <p className="mt-2 text-xs text-muted">Add your top-level divisions (e.g. by region or business line), then assign facilities below.</p>}
      </Card>

      {/* Facilities + departments */}
      <Card className="p-0">
        <div className="border-b border-line p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
            <Building2 size={16} className="text-sage-600" /> Facilities &amp; departments
            <span className="text-xs font-normal text-muted">({facilities.length})</span>
          </h2>
        </div>
        {facilities.length === 0 ? (
          <EmptyState title="No facilities" />
        ) : (
          <div className="divide-y divide-line">
            {facilities.map((f) => (
              <FacilityRow
                key={f.id}
                facility={f}
                divisions={divisions}
                departments={deptsByFacility.get(f.id) ?? []}
                onAssign={(divId) => setFacilityDivision(f.id, divId)}
                onChanged={() => listDepartments().then(setDepartments)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function FacilityRow({
  facility,
  divisions,
  departments,
  onAssign,
  onChanged,
}: {
  facility: FacilityLite
  divisions: Division[]
  departments: Department[]
  onAssign: (divisionId: string | null) => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [newDept, setNewDept] = useState('')

  async function addDept() {
    if (!newDept.trim()) return
    const { error } = await createDepartment(facility.id, newDept)
    if (error) toast({ tone: 'error', title: 'Could not add department', description: error })
    else { setNewDept(''); onChanged() }
  }
  async function removeDept(d: Department) {
    await deleteDepartment(d.id)
    onChanged()
  }

  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="font-medium text-ink">
          {facility.name}
          {facility.state ? <span className="font-normal text-muted"> · {facility.state}</span> : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {departments.map((d) => (
            <span key={d.id} className="flex items-center gap-1 rounded bg-brand-50 px-2 py-0.5 text-xs text-muted">
              {d.name}
              <button onClick={() => removeDept(d)} className="hover:text-rust-500"><X size={11} /></button>
            </span>
          ))}
          <div className="flex items-center gap-1">
            <input
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDept()}
              placeholder="+ department"
              className="w-28 rounded border border-dashed border-line bg-paper px-1.5 py-0.5 text-xs outline-none focus:border-ink"
            />
          </div>
        </div>
      </div>
      <div className="shrink-0">
        <select
          value={facility.division_id ?? ''}
          onChange={(e) => onAssign(e.target.value || null)}
          className="rounded-lg border border-line bg-paper px-2 py-1.5 text-sm"
        >
          <option value="">Unassigned</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
