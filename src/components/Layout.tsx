import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { demoMode } from '../lib/supabase'
import { disableDemo, resetDemo, downloadSupabaseSql } from '../lib/demo'

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink">
        <svg width="16" height="16" viewBox="0 0 32 32" aria-hidden>
          <rect x="6" y="17" width="4" height="9" rx="1.4" fill="#6e9a6a" />
          <rect x="14" y="11" width="4" height="15" rx="1.4" fill="#cd7c4f" />
          <rect x="22" y="7" width="4" height="19" rx="1.4" fill="#f4f1ea" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink">clinilytics</span>
      <span className="rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-paper">
        ATS
      </span>
    </div>
  )
}

function DemoBanner() {
  if (!demoMode) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-ink px-4 py-1.5 text-center font-mono text-[11px] tracking-wide text-paper">
      <span className="opacity-90">LOCAL WORKSPACE — saved in this browser only</span>
      <button className="rounded bg-paper/15 px-2 py-0.5 font-semibold hover:bg-paper/25" onClick={downloadSupabaseSql}>
        ↓ Export to Supabase
      </button>
      <button
        className="underline underline-offset-2 hover:opacity-80"
        onClick={() => { if (confirm('Reset the local workspace back to the starting data and clear your candidates?')) { resetDemo(); window.location.reload() } }}
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

export function Layout() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    if (demoMode) {
      window.location.hash = '#/login'
      window.location.reload()
      return
    }
    navigate('/login')
  }

  const links = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/facilities', label: 'Facilities' },
    { to: '/candidates', label: 'Candidates' },
    { to: '/matching', label: 'Matching' },
    { to: '/positions', label: 'Positions' },
    ...(isAdmin ? [{ to: '/import', label: 'Import', end: false }] : []),
    ...(isAdmin && !demoMode ? [{ to: '/setup', label: 'Setup', end: false }] : []),
    ...(isAdmin ? [{ to: '/team', label: 'Team', end: false }] : []),
  ]

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive ? 'bg-ink text-paper' : 'text-muted hover:bg-brand-50 hover:text-ink'
    }`

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <DemoBanner />

      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4">
          <Wordmark />

          {/* Desktop nav */}
          <nav className="hidden flex-1 items-center gap-1 overflow-x-auto md:flex">
            {links.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={tabClass}>
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {/* connection / mode chip */}
            <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[11px] tracking-wide text-muted sm:inline-flex">
              <span className={`h-1.5 w-1.5 rounded-full ${demoMode ? 'bg-clay-500' : 'bg-sage-500'}`} />
              {demoMode ? 'LOCAL' : 'CONNECTED'}
            </span>

            {/* user */}
            <div className="hidden text-right leading-tight sm:block">
              <div className="max-w-[150px] truncate text-xs font-medium text-ink">
                {profile?.full_name || profile?.email || 'You'}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{profile?.role}</div>
            </div>
            <button
              onClick={handleSignOut}
              className="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-brand-50 hover:text-ink sm:inline-flex"
            >
              <LogOut size={15} /> Sign out
            </button>

            {/* mobile menu toggle */}
            <button className="text-muted md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {open && (
          <nav className="border-t border-line bg-surface px-3 py-2 md:hidden">
            <div className="grid grid-cols-2 gap-1">
              {links.map(({ to, label, end }) => (
                <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={tabClass}>
                  {label}
                </NavLink>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
              <div className="text-xs">
                <div className="font-medium text-ink">{profile?.full_name || profile?.email}</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{profile?.role}</div>
              </div>
              <button onClick={handleSignOut} className="btn-secondary py-1.5">
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-4 font-mono text-[11px] tracking-wide text-muted sm:px-6">
          <span>© 2026 Clinilytics ATS — for American Medical Administrators</span>
          <span className="hidden sm:inline">{demoMode ? 'local workspace' : 'pcpkhdfgmjrzvwfkcznn.supabase.co'}</span>
        </div>
      </footer>
    </div>
  )
}
