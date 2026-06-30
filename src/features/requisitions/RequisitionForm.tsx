import { useEffect, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { Modal, Button, Input, Select } from '../../components/primitives'
import { useToast } from '../../components/primitives'
import type { Facility, OrgUser, RoleFamily, RequisitionRow } from '../../lib/v2/types'
import { createRequisition, updateRequisition, type ReqInput } from '../../lib/v2/requisitions'
import { getRequisitionQuestions, setRequisitionQuestions, qid, type ScreeningQuestion } from '../../lib/v2/screenings'
import { DEFAULT_PRESCREEN } from '../../lib/v2/careers'
import { listDepartments, type Department } from '../../lib/v2/hierarchy'

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
  const [departmentId, setDepartmentId] = useState(existing?.department_id ?? '')
  const [departments, setDepartments] = useState<Department[]>([])
  const [roleFamily, setRoleFamily] = useState(existing?.role_family ?? '')
  const [specialty, setSpecialty] = useState(existing?.specialty ?? '')
  const [headcount, setHeadcount] = useState(String(existing?.headcount ?? 1))
  const [budget, setBudget] = useState(existing?.budget != null ? String(existing.budget) : '')
  const [managerId, setManagerId] = useState(existing?.hiring_manager_id ?? '')
  const [hmId, setHmId] = useState(existing?.actual_hiring_manager_id ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [requirements, setRequirements] = useState(existing?.requirements ?? '')
  // Pre-application screening questionnaire (requisitions.screening_questions) —
  // the same questions candidates answer on the public careers application.
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (existing) getRequisitionQuestions(existing.id).then(setQuestions)
  }, [existing])
  useEffect(() => {
    listDepartments().then(setDepartments)
  }, [])
  const facilityDepts = departments.filter((d) => d.facility_id === facilityId)
  // Hiring managers are a distinct population from recruiters; fall back to all
  // users only if no hiring_manager-role users exist yet.
  const hmUsers = users.filter((u) => u.role === 'hiring_manager')
  const hmList = hmUsers.length ? hmUsers : users

  function addQuestion() {
    setQuestions((q) => [...q, { id: qid(), question: '' }])
  }
  function updateQuestion(i: number, text: string) {
    setQuestions((q) => q.map((x, idx) => (idx === i ? { ...x, question: text } : x)))
  }
  function removeQuestion(i: number) {
    setQuestions((q) => q.filter((_, idx) => idx !== i))
  }
  function loadStarters() {
    setQuestions(DEFAULT_PRESCREEN.map((d) => ({ id: qid(), question: d.question, competency: d.competency })))
  }

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
      department_id: departmentId || null,
      role_family: roleFamily,
      specialty: specialty.trim() || null,
      headcount: Math.max(1, parseInt(headcount, 10) || 1),
      budget: budget.trim() ? Number(budget) : null,
      hiring_manager_id: managerId || null,
      actual_hiring_manager_id: hmId || null,
      description: description.trim() || null,
      requirements: requirements.trim() || null,
    }
    const res = existing
      ? { id: existing.id, error: (await updateRequisition(existing.id, input)).error }
      : await createRequisition(input)
    if (res.error) {
      setSaving(false)
      setError(res.error)
      return
    }
    // Persist the pre-application screening questionnaire onto the requisition.
    const reqId = res.id ?? existing?.id
    if (reqId) await setRequisitionQuestions(reqId, questions.filter((q) => q.question.trim()))
    setSaving(false)
    toast({ tone: 'success', title: existing ? 'Requisition updated' : 'Requisition created' })
    onSaved(reqId)
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
          <Select label="Facility" value={facilityId} onChange={(e) => { setFacilityId(e.target.value); setDepartmentId('') }} placeholder="Select facility…">
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
        <Select
          label="Department"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          placeholder={facilityId ? (facilityDepts.length ? 'Select department…' : 'No departments — add them in Org structure') : 'Pick a facility first'}
        >
          {facilityDepts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Med/Surg, Primary Care…" />
          <Select label="Recruiter" value={managerId} onChange={(e) => setManagerId(e.target.value)} placeholder="Unassigned">
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </Select>
        </div>
        <Select
          label="Hiring manager"
          value={hmId}
          onChange={(e) => setHmId(e.target.value)}
          placeholder={hmUsers.length ? 'Unassigned' : 'Unassigned (no hiring-manager users yet)'}
        >
          {hmList.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
              {u.role && u.role !== 'hiring_manager' ? ` · ${u.role}` : ''}
            </option>
          ))}
        </Select>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Headcount" type="number" min={1} value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
          <Input label="Budget (annual, $)" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="95000" />
        </div>
        <div>
          <label className="label">
            Description <span className="font-normal text-muted">(feeds AI matching &amp; the public careers page)</span>
          </label>
          <textarea
            className="input min-h-[90px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the role: setting (SNF/LTC), shift/schedule, team, what makes it a good fit…"
          />
        </div>
        <div>
          <label className="label">
            Requirements <span className="font-normal text-muted">(licenses, certifications, must-haves)</span>
          </label>
          <textarea
            className="input min-h-[90px]"
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="e.g. Active RN license, BLS, 2+ years SNF/LTC experience, EHR proficiency…"
          />
        </div>
        <div>
          <label className="label">
            Application questionnaire{' '}
            <span className="font-normal text-muted">(answered at apply time; AI scores fit → auto-rejects weak matches &amp; offers better-fit roles)</span>
          </label>
          <div className="space-y-2">
            {questions.map((q, i) => (
              <div key={q.id} className="flex items-start gap-2">
                <span className="mt-2 text-xs text-muted tnum">{i + 1}.</span>
                <textarea
                  className="input min-h-[44px] flex-1"
                  value={q.question}
                  onChange={(e) => updateQuestion(i, e.target.value)}
                  placeholder="e.g. Do you hold an active RN license, and in which state(s)?"
                />
                <Button variant="ghost" size="sm" aria-label="Remove question" onClick={() => removeQuestion(i)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" leftIcon={<Plus size={13} />} onClick={addQuestion}>
              Add question
            </Button>
            {questions.length === 0 && (
              <Button size="sm" variant="ghost" onClick={loadStarters}>
                Use starter set
              </Button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Shown on the public careers application. On submit, AI scores the candidate's answers + résumé
            against this role — under 50% match is auto-declined, and stronger-fit open roles are offered as
            one-click apply. Leave empty to use a default healthcare question set.
          </p>
        </div>

        {error && <p className="text-sm text-rust-700">{error}</p>}
      </div>
    </Modal>
  )
}
