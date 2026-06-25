import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Building2, Users, Sparkles, UserCog, Briefcase, Upload, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { demoMode } from '../lib/supabase'
import { disableDemo, resetDemo, downloadSupabaseSql } from '../lib/demo'

function DemoBanner() {
  if (!demoMode) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-brand-600 px-4 py-1.5 text-center text-xs font-medium text-white">
      <span>💾 Local workspace — saved in this browser only (not yet shared/cloud).</span>
      <button
        className="rounded bg-white/20 px-2 py-0.5 font-semibold hover:bg-white/30"
        onClick={downloadSupabaseSql}
      >
        ⬇ Export to Supabase
      </button>
      <button
        className="underline underline-offset-2 hover:opacity-80"
        onClick={() => { if (confirm('Reset the local workspace back to the starting facilities and clear your candidates?')) { resetDemo(); window.location.reload() } }}
      >
        Reset
      </button>
      <button
        className="underline underline-offset-2 hover:opacity-80"
        onClick={() => { disableDemo(); window.location.hash = '#/login'; window.location.reload() }}
      >
        Exit
      </button>
    </div>
  )
}

const navItem = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors'

export function Layout() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    if (demoMode) {
      // Re-init the app on the real client after leaving the demo.
      window.location.hash = '#/login'
      window.location.reload()
      return
    }
    navigate('/login')
  }

  const links = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/facilities', label: 'Facilities & Needs', icon: Building2 },
    { to: '/candidates', label: 'Candidates', icon: Users },
    { to: '/matching', label: 'AI Matching', icon: Sparkles },
    { to: '/positions', label: 'Positions', icon: Briefcase },
    ...(isAdmin ? [{ to: '/import', label: 'Import', icon: Upload }] : []),
    ...(isAdmin ? [{ to: '/team', label: 'Team', icon: UserCog }] : []),
  ]

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-white shadow-lg ring-1 ring-gray-200 transition-transform lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            R
          </div>
          <span className="font-semibold text-gray-900">Recruiting</span>
        </div>
        <nav className="space-y-1 p-3">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `${navItem} ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-gray-200 p-3">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-medium text-gray-900">
              {profile?.full_name || profile?.email}
            </div>
            <div className="text-xs capitalize text-gray-400">{profile?.role}</div>
          </div>
          <button onClick={handleSignOut} className={`${navItem} w-full text-gray-600 hover:bg-gray-50`}>
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <DemoBanner />
        <header className="flex h-16 items-center gap-3 border-b border-gray-200 bg-white px-4 lg:hidden">
          <button onClick={() => setOpen((v) => !v)} className="text-gray-600">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
          <span className="font-semibold">Recruiting</span>
        </header>
        <main className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
