import { useState } from 'react'
import { Modal, Button, Input, Select } from '../../components/primitives'
import { useToast } from '../../components/primitives'
import type { Facility, OrgUser, RoleFamily, RequisitionRow } from '../../lib/v2/types'
import { createRequisition, updateRequisition, type ReqInput } from '../../lib/v2/requisitions'

export function RequisitionForm({
  existing,
  facilities,
  users,
  roleFamilies,
  onClose,
  onSaved,
}: {
  existing?: RequisitionRow | null
  facilities: Facility[]
  users: OrgUser[]
  roleFamilies: RoleFamily[]
  onClose: () => void
  onSaved: (id?: string) => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState(existing?.title ?? '')
  const [facilityId, setFacilityId] = useState(existing?.facility_id ?? '')
  const [roleFamily, setRoleFamily] = useState(existing?.role_family ?? '')
  const [specialty, setSpecialty] = useState(existing?.specialty ?? '')
  const [headcount, setHeadcount] = useState(String(existing?.headcount ?? 1))
  const [budget, setBudget] = useState(existing?.budget != null ? String(existing.budget) : '')
  const [managerId, setManagerId] = useState(existing?.hiring_manager_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!title.trim() || !facilityId || !roleFamily) {
      setError('Title, facility, and role family are required.')
      return
    }
    setSaving(true)
    setError(null)
    const input: ReqInput = {
      title: title.trim(),
      facility_id: facilityId,
      role_family: roleFamily,
      specialty: specialty.trim() || null,
      headcount: Math.max(1, parseInt(headcount, 10) || 1),
      budget: budget.trim() ? Number(budget) : null,
      hiring_manager_id: managerId || null,
    }
    const res = existing
      ? { id: existing.id, error: (await updateRequisition(existing.id, input)).error }
      : await createRequisition(input)
    setSaving(false)
    if (res.error) {
      setError(res.error)
      return
    }
    toast({ tone: 'success', title: existing ? 'Requisition updated' : 'Requisition created' })
    onSaved(res.id ?? existing?.id)
  }

  return (
    <Modal
      title={existing ? 'Edit requisition' : 'New requisition'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {existing ? 'Save changes' : 'Create requisition'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Registered Nurse — Med/Surg" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Facility" value={facilityId} onChange={(e) => setFacilityId(e.target.value)} placeholder="Select facility…">
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.state ? ` · ${f.state}` : ''}
              </option>
            ))}
          </Select>
          <Select label="Role family" value={roleFamily} onChange={(e) => setRoleFamily(e.target.value)} placeholder="Select role family…">
            {roleFamilies.map((rf) => (
              <option key={rf.code} value={rf.code}>
                {rf.label} ({rf.code})
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Med/Surg, Primary Care…" />
          <Select label="Hiring manager" value={managerId} onChange={(e) => setManagerId(e.target.value)} placeholder="Unassigned">
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Headcount" type="number" min={1} value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
          <Input label="Budget (annual, $)" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="95000" />
        </div>
        {error && <p className="text-sm text-rust-700">{error}</p>}
      </div>
    </Modal>
  )
}
