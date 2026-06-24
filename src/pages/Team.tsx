import { useEffect, useState } from 'react'
import { ShieldCheck, User as UserIcon, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { downloadCsv } from '../lib/export'
import type { Profile, Role } from '../lib/types'
import { EmptyState, Spinner } from '../components/ui'

export function Team() {
  const { profile: me } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setProfiles((data as Profile[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function update(id: string, patch: Partial<Profile>) {
    setSavingId(id)
    await supabase.from('profiles').update(patch).eq('id', id)
    await load()
    setSavingId(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500">Manage recruiter access and roles.</p>
        </div>
        <button
          className="btn-secondary"
          onClick={() =>
            downloadCsv(
              `team-${new Date().toISOString().slice(0, 10)}.csv`,
              profiles.map((p) => ({
                full_name: p.full_name,
                email: p.email,
                role: p.role,
                active: p.active,
              })),
            )
          }
          disabled={profiles.length === 0}
        >
          <Download size={16} /> Export
        </button>
      </div>

      <div className="card border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <strong>Adding people:</strong> create their account in Supabase → Authentication →
        Users → <em>Add user</em> (set email + password, mark email confirmed). They'll appear
        here automatically on first sign-in, where you can set their role.
      </div>

      {loading ? (
        <Spinner label="Loading team…" />
      ) : profiles.length === 0 ? (
        <EmptyState title="No team members yet" />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {profiles.map((p) => {
                  const isSelf = p.id === me?.id
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 font-medium text-gray-900">
                          {p.role === 'admin' ? (
                            <ShieldCheck size={16} className="text-brand-600" />
                          ) : (
                            <UserIcon size={16} className="text-gray-400" />
                          )}
                          {p.full_name || '—'}
                          {isSelf && <span className="text-xs text-gray-400">(you)</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.email}</td>
                      <td className="px-4 py-3">
                        <select
                          className="rounded-md border-0 bg-transparent text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                          value={p.role}
                          disabled={isSelf || savingId === p.id}
                          onChange={(e) => update(p.id, { role: e.target.value as Role })}
                        >
                          <option value="recruiter">Recruiter</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {p.active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isSelf && (
                          <button
                            className="btn-secondary"
                            disabled={savingId === p.id}
                            onClick={() => update(p.id, { active: !p.active })}
                          >
                            {p.active ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
