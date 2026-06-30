import { useEffect, useMemo, useState } from 'react'
import { Network, Plus, Trash2, Pencil, Check, X, Building2, Layers, Briefcase } from 'lucide-react'
import { Button, Card, Input, Select, useToast } from '../../components/primitives'
import { Spinner, EmptyState } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import {
  listDivisions,
  createDivision,
  renameDivision,
  deleteDivision,
  listDepartments,
  createDepartment,
  deleteDepartment,
  listFacilitiesLite,
  createFacility,
  updateFacility,
  assignFacilityDivision,
  listRoleFamiliesFull,
  createRoleFamily,
  deleteRoleFamily,
  suggestRoleCode,
  type Division,
  type Department,
  type FacilityLite,
  type RoleFamilyRow,
} from '../../lib/v2/hierarchy'

/**
 * Admin "Org structure" — the single place to build the taxonomy that drives
 * every filter dropdown app-wide: Divisions, Facilities (with city/state),
 * Departments, and Roles. Anything created here flows into the cascading pickers
 * on requisitions, the careers page filters, and the public staffing-request form.
 */
export function OrgStructurePage() {
  const { toast } = useToast()
  const { isAdmin } = useAuth()
  const [divisions, setDivisions] = useState<Division[] | null>(null)
  const [facilities, setFacilities] = useState<FacilityLite[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [roles, setRoles] = useState<RoleFamilyRow[]>([])
  const [newDivision, setNewDivision] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  function refresh() {
    listDivisions().then(setDivisions)
    listFacilitiesLite().then(setFacilities)
    listDepartments().then(setDepartments)
    listRoleFamiliesFull().then(setRoles)
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
          Build your Divisions, Facilities (with city &amp; state), Departments, and Roles in one place. Everything here
          feeds the filter dropdowns on requisitions, the public careers page, and the staffing-request form.
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
        {divisions.length === 0 && <p className="mt-2 text-xs text-muted">Add your top-level divisions (e.g. by region or business line), then add facilities below.</p>}
      </Card>

      {/* Facilities + departments */}
      <Card className="p-0">
        <div className="border-b border-line p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
            <Building2 size={16} className="text-sage-600" /> Facilities &amp; departments
            <span className="text-xs font-normal text-muted">({facilities.length})</span>
          </h2>
          <NewFacilityForm divisions={divisions} onCreated={refresh} />
        </div>
        {facilities.length === 0 ? (
          <EmptyState title="No facilities yet" hint="Add your first facility above — name, city, and state." />
        ) : (
          <div className="divide-y divide-line">
            {facilities.map((f) => (
              <FacilityRow
                key={f.id}
                facility={f}
                divisions={divisions}
                departments={deptsByFacility.get(f.id) ?? []}
                onAssign={(divId) => setFacilityDivision(f.id, divId)}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Roles (role_families) */}
      <RolesCard roles={roles} canEdit={isAdmin} onChanged={() => listRoleFamiliesFull().then(setRoles)} />
    </div>
  )
}

function NewFacilityForm({ divisions, onCreated }: { divisions: Division[]; onCreated: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const [saving, setSaving] = useState(false)

  async function add() {
    if (!name.trim()) { toast({ tone: 'error', title: 'Facility name is required' }); return }
    setSaving(true)
    const { error } = await createFacility({ name, city, state, division_id: divisionId || null })
    setSaving(false)
    if (error) { toast({ tone: 'error', title: 'Could not add facility', description: error }); return }
    setName(''); setCity(''); setState(''); setDivisionId('')
    toast({ tone: 'success', title: 'Facility added' })
    onCreated()
  }

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <Input aria-label="Facility name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Facility name" />
      <Input aria-label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
      <Input aria-label="State" value={state} onChange={(e) => setState(e.target.value)} placeholder="State (e.g. TX)" maxLength={2} />
      <Select aria-label="Division" value={divisionId} onChange={(e) => setDivisionId(e.target.value)} placeholder="Division (optional)">
        {divisions.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </Select>
      <Button onClick={add} loading={saving} leftIcon={<Plus size={14} />}>Add facility</Button>
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
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(facility.name)
  const [city, setCity] = useState(facility.city ?? '')
  const [state, setState] = useState(facility.state ?? '')

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
  async function saveEdit() {
    const { error } = await updateFacility(facility.id, { name, city, state })
    if (error) { toast({ tone: 'error', title: 'Update failed', description: error }); return }
    setEditing(false)
    onChanged()
  }

  const place = [facility.city, facility.state].filter(Boolean).join(', ')

  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <Input aria-label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
            <Input aria-label="State" value={state} onChange={(e) => setState(e.target.value)} placeholder="State" maxLength={2} />
            <div className="flex gap-1 sm:col-span-3">
              <Button size="sm" onClick={saveEdit} leftIcon={<Check size={13} />}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(facility.name); setCity(facility.city ?? ''); setState(facility.state ?? '') }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-ink">{facility.name}</span>
            {place && <span className="text-sm font-normal text-muted">· {place}</span>}
            <button onClick={() => setEditing(true)} className="text-muted hover:text-ink" aria-label="Edit facility"><Pencil size={12} /></button>
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {departments.map((d) => (
            <span key={d.id} className="flex items-center gap-1 rounded bg-brand-50 px-2 py-0.5 text-xs text-muted">
              {d.name}
              <button onClick={() => removeDept(d)} className="hover:text-rust-500"><X size={11} /></button>
            </span>
          ))}
          <input
            value={newDept}
            onChange={(e) => setNewDept(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDept()}
            placeholder="+ department"
            className="w-28 rounded border border-dashed border-line bg-paper px-1.5 py-0.5 text-xs outline-none focus:border-ink"
          />
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

function RolesCard({ roles, canEdit, onChanged }: { roles: RoleFamilyRow[]; canEdit: boolean; onChanged: () => void }) {
  const { toast } = useToast()
  const [label, setLabel] = useState('')
  const [code, setCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  function onLabel(v: string) {
    setLabel(v)
    if (!codeTouched) setCode(suggestRoleCode(v))
  }

  async function add() {
    if (!label.trim()) { toast({ tone: 'error', title: 'A role label is required' }); return }
    setSaving(true)
    const { error } = await createRoleFamily(code, label, (roles.length + 1) * 10)
    setSaving(false)
    if (error) { toast({ tone: 'error', title: 'Could not add role', description: error }); return }
    setLabel(''); setCode(''); setCodeTouched(false)
    toast({ tone: 'success', title: 'Role added' })
    onChanged()
  }
  async function remove(r: RoleFamilyRow) {
    if (!confirm(`Delete role "${r.label}" (${r.code})? This is blocked if any requisition uses it.`)) return
    const { error } = await deleteRoleFamily(r.code)
    if (error) toast({ tone: 'error', title: 'Could not delete', description: error })
    else onChanged()
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
        <Briefcase size={16} className="text-clay-500" /> Roles
        <span className="text-xs font-normal text-muted">({roles.length})</span>
      </h2>
      <p className="mb-3 text-xs text-muted">
        The role catalog behind every "Role" dropdown (requisitions, careers, staffing requests).
        {!canEdit && ' Adding or removing roles requires an admin.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {roles.map((r) => (
          <div key={r.code} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-sm">
            <span className="text-ink">{r.label}</span>
            <span className="font-mono text-[10px] text-muted">{r.code}</span>
            {canEdit && (
              <button onClick={() => remove(r)} className="text-muted hover:text-rust-500" aria-label={`Delete ${r.label}`}><Trash2 size={12} /></button>
            )}
          </div>
        ))}
        {roles.length === 0 && <span className="text-xs text-muted">No roles yet.</span>}
      </div>
      {canEdit && (
        <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_140px_auto]">
          <Input aria-label="Role label" value={label} onChange={(e) => onLabel(e.target.value)} placeholder="Role label (e.g. Nursing Home Administrator)" />
          <Input aria-label="Code" value={code} onChange={(e) => { setCode(e.target.value); setCodeTouched(true) }} placeholder="Code" className="font-mono" />
          <Button onClick={add} loading={saving} leftIcon={<Plus size={14} />}>Add role</Button>
        </div>
      )}
    </Card>
  )
}
