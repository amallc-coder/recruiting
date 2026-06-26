import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Menu, X, Settings, ChevronDown, Users, Upload, Database } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { demoMode } from '../lib/supabase'
import { disableDemo, resetDemo, downloadSupabaseSql } from '../lib/demo'

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Clinilytics mark: white tile, three stacked bars (top terracotta, rest charcoal). */}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-line">
        <svg width="20" height="17" viewBox="0 0 24 20" aria-hidden>
          <rect x="3" y="2.5" width="11" height="3.6" rx="1.8" fill="#d2774a" />
          <rect x="3" y="8.2" width="18" height="3.6" rx="1.8" fill="#26221f" />
          <rect x="3" y="13.9" width="14" height="3.6" rx="1.8" fill="#26221f" />
        </svg>
      </span>
      <span className="text-[18px] font-bold lowercase tracking-tight text-ink">clinilytics</span>
      <span className="rounded-full bg-sage-50 px-2.5 py-0.5 text-xs font-medium text-sage-700 ring-1 ring-inset ring-sage-100">
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

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-ink text-paper' : 'text-muted hover:bg-brand-50 hover:text-ink'
  }`

export function Layout() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const adminRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) setAdminOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  async function handleSignOut() {
    await signOut()
    if (demoMode) { window.location.hash = '#/login'; window.location.reload(); return }
    navigate('/login')
  }

  // Product tabs (everyone) in the lower bar; admin tools live under the Admin menu.
  const tabs = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/jobs', label: 'Jobs', end: false },
    { to: '/candidates', label: 'Candidates', end: false },
    { to: '/facilities', label: 'Facilities', end: false },
    { to: '/matching', label: 'Matching', end: false },
    { to: '/positions', label: 'Positions', end: false },
  ]
  const adminLinks = [
    { to: '/team', label: 'Team', icon: Users },
    { to: '/import', label: 'Import', icon: Upload },
    ...(!demoMode ? [{ to: '/setup', label: 'Cloud setup', icon: Database }] : []),
  ]

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <DemoBanner />

      <header className="sticky top-0 z-30">
        {/* ── Top layer: brand + account controls ── */}
        <div className="border-b border-line bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-3 px-4">
            <Wordmark />

            <div className="ml-auto flex items-center gap-2">
              {/* live status */}
              <span className="hidden items-center gap-1.5 px-1.5 text-sm text-muted sm:inline-flex">
                <span className={`h-2 w-2 rounded-full ${demoMode ? 'bg-clay-500' : 'bg-sage-500'}`} />
                {demoMode ? 'Local' : 'Live'}
              </span>

              {/* settings */}
              {isAdmin && (
                <NavLink
                  to={demoMode ? '/team' : '/setup'}
                  title="Settings"
                  className={({ isActive }) =>
                    `hidden h-8 w-8 items-center justify-center rounded-md border border-line bg-surface hover:bg-brand-50 sm:inline-flex ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`
                  }
                >
                  <Settings size={16} />
                </NavLink>
              )}

              {/* Admin menu */}
              {isAdmin && (
                <div className="relative hidden sm:block" ref={adminRef}>
                  <button
                    onClick={() => setAdminOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm font-medium text-ink hover:bg-brand-50"
                  >
                    Admin
                    <ChevronDown size={13} className={adminOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>
                  {adminOpen && (
                    <div className="absolute right-0 z-40 mt-1.5 w-48 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
                      <div className="border-b border-line px-3 py-2">
                        <div className="truncate text-sm font-medium text-ink">{profile?.full_name || profile?.email}</div>
                        <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{profile?.role}</div>
                      </div>
                      {adminLinks.map(({ to, label, icon: Icon }) => (
                        <NavLink
                          key={to}
                          to={to}
                          onClick={() => setAdminOpen(false)}
                          className={({ isActive }) =>
                            `flex items-center gap-2 px-3 py-2 text-sm ${isActive ? 'bg-brand-50 text-ink' : 'text-muted hover:bg-brand-50 hover:text-ink'}`
                          }
                        >
                          <Icon size={15} /> {label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleSignOut}
                className="hidden items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm font-medium text-ink hover:bg-brand-50 sm:inline-flex"
              >
                <LogOut size={15} /> Sign out
              </button>

              {/* mobile toggle */}
              <button className="text-muted md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
                {open ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </div>

        {/* ── Bottom layer: product navigation ── */}
        <div className="hidden border-b border-line bg-surface md:block">
          <nav className="mx-auto flex h-11 max-w-[1440px] items-center gap-1 overflow-x-auto px-4">
            {tabs.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={tabClass}>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* ── Mobile drawer ── */}
        {open && (
          <div className="border-b border-line bg-surface px-3 py-2 md:hidden">
            <div className="grid grid-cols-2 gap-1">
              {tabs.map(({ to, label, end }) => (
                <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={tabClass}>
                  {label}
                </NavLink>
              ))}
              {isAdmin && adminLinks.map(({ to, label }) => (
                <NavLink key={to} to={to} onClick={() => setOpen(false)} className={tabClass}>
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
          </div>
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
