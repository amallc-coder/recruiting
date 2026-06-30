import { useEffect, useMemo, useState } from 'react'
import { FilePlus, CheckCircle2 } from 'lucide-react'
import { Button, Card, Input, Select } from '../../components/primitives'
import { submitPublicStaffingRequest, REQUEST_URGENCIES, type Urgency, type PositionType } from '../../lib/v2/requisitionRequests'
import { getOrgHierarchy, type OrgHierarchy } from '../../lib/v2/hierarchy'

/**
 * PUBLIC staffing-request page (v2). Renders OUTSIDE the authenticated app shell —
 * facility managers without an ATS login submit a request to fill, picking
 * Division → Facility → Department → Role from the org hierarchy. Submits via the
 * submit_staffing_request SECURITY DEFINER RPC.
 */
export function PublicStaffingRequestPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const [facilityId, setFacilityId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [roleFamily, setRoleFamily] = useState('')
  const [title, setTitle] = useState('')
  const [headcount, setHeadcount] = useState('1')
  const [positionType, setPositionType] = useState<PositionType>('new')
  const [replacingName, setReplacingName] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('normal')
  const [targetStart, setTargetStart] = useState('')
  const [reason, setReason] = useState('')
  const [hier, setHier] = useState<OrgHierarchy | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    getOrgHierarchy().then(setHier).catch(() => setHier({ ok: false, divisions: [], role_families: [] }))
  }, [])

  const divisions = hier?.divisions ?? []
  // Index by position since a "division" id can be null (the "Other facilities" bucket).
  const division = useMemo(() => divisions.find((_, i) => String(i) === divisionId), [divisions, divisionId])
  const facilities = division?.facilities ?? []
  const facility = useMemo(() => facilities.find((f) => f.id === facilityId), [facilities, facilityId])
  const departments = facility?.departments ?? []

  function selectDivision(idx: string) {
    setDivisionId(idx)
    setFacilityId('')
    setDepartmentId('')
  }
  function selectFacility(id: string) {
    setFacilityId(id)
    setDepartmentId('')
  }

  async function submit() {
    if (!name.trim() || !title.trim()) {
      setError('Please give your name and what you need filled.')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error } = await submitPublicStaffingRequest({
      requester_name: name.trim(),
      requester_email: email.trim() || null,
      facility_id: facility?.id ?? null,
      department_id: departmentId || null,
      facility_name: facility?.name ?? null,
      title: title.trim(),
      role_family: roleFamily || null,
      headcount: Math.max(1, parseInt(headcount, 10) || 1),
      urgency,
      position_type: positionType,
      replacing_name: positionType === 'replacement' ? replacingName.trim() || null : null,
      target_start: targetStart || null,
      reason: reason.trim() || null,
    })
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    setDone(true)
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-1 px-4 py-8 sm:px-6">
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-ink">
            <FilePlus size={26} className="text-sage-600" /> Request staffing
          </h1>
          <p className="text-sm text-muted">
            Need coverage at your facility? Submit a request and the American Medical Administrators recruiting team will open a
            search. No login required.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        {done ? (
          <Card className="flex flex-col items-center gap-3 p-10 text-center">
            <CheckCircle2 size={40} className="text-sage-600" />
            <h2 className="text-xl font-semibold text-ink">Request submitted</h2>
            <p className="max-w-md text-sm text-muted">
              Thank you. Our recruiting team has your request and will follow up{email.trim() ? ` at ${email.trim()}` : ''} shortly.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setDone(false)
                setTitle('')
                setRoleFamily('')
                setDepartmentId('')
                setHeadcount('1')
                setPositionType('new')
                setReplacingName('')
                setUrgency('normal')
                setTargetStart('')
                setReason('')
              }}
            >
              Submit another request
            </Button>
          </Card>
        ) : (
          <Card className="space-y-5 p-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">About you</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
                <Input label="Your email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@facility.com" />
              </div>
            </div>

            <div className="border-t border-line pt-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Where</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Select label="Division" value={divisionId} onChange={(e) => selectDivision(e.target.value)} placeholder={hier ? 'Select division…' : 'Loading…'}>
                  {divisions.map((d, i) => (
                    <option key={d.id ?? `other-${i}`} value={String(i)}>{d.name}</option>
                  ))}
                </Select>
                <Select label="Facility" value={facilityId} onChange={(e) => selectFacility(e.target.value)} placeholder={division ? 'Select facility…' : 'Pick a division first'}>
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </Select>
                <Select label="Department (optional)" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} placeholder={facility ? (departments.length ? 'Select department…' : 'No departments listed') : 'Pick a facility first'}>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="border-t border-line pt-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">What you need</h3>
              <div className="mt-3 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="New or replacement position" value={positionType} onChange={(e) => setPositionType(e.target.value as PositionType)}>
                    <option value="new">New position</option>
                    <option value="replacement">Replacement</option>
                  </Select>
                  {positionType === 'replacement' && (
                    <Input
                      label="Who is being replaced"
                      value={replacingName}
                      onChange={(e) => setReplacingName(e.target.value)}
                      placeholder="Name of departing staff member"
                    />
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Role" value={roleFamily} onChange={(e) => setRoleFamily(e.target.value)} placeholder="Select role…">
                    {(hier?.role_families ?? []).map((r) => (
                      <option key={r.code} value={r.code}>{r.label}</option>
                    ))}
                  </Select>
                  <Input label="Title / details" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Night-shift RN, Med/Surg" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Input label="How many" type="number" min={1} value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
                  <Select label="How urgent" value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
                    {REQUEST_URGENCIES.map((u) => (
                      <option key={u} value={u} className="capitalize">{u}</option>
                    ))}
                  </Select>
                  <Input label="Needed by" type="date" value={targetStart} onChange={(e) => setTargetStart(e.target.value)} />
                </div>
                <div>
                  <label className="label">Details (optional)</label>
                  <textarea className="input min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shift, unit, why it's needed — census growth, resignation, leave coverage…" />
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-rust-700">{error}</p>}
            <p className="text-xs text-muted">
              Submitting sends this to the recruiting leadership review queue for approval — it does not open a
              requisition automatically. You'll hear back once it's reviewed.
            </p>
            <Button onClick={submit} loading={submitting} className="w-full">
              Submit request
            </Button>
          </Card>
        )}
      </main>
    </div>
  )
}
