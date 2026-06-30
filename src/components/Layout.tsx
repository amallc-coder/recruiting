import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Briefcase,
  UserRound,
  BarChart3,
  Building2,
  Sparkles,
  ClipboardList,
  FileText,
  Gauge,
  Bot,
  Handshake,
  Wallet,
  Users,
  Upload,
  Plug,
  Database,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  Radar,
  Wand2,
  Terminal,
  ShieldCheck,
  MessageSquare,
  BookOpen,
  Gift,
  FilePlus,
  Inbox,
  Megaphone,
  Network,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { demoMode } from '../lib/supabase'
import { disableDemo, resetDemo, downloadSupabaseSql } from '../lib/demo'
import { roleCan, roleLabel, type Capability } from '../lib/roles'
import { useV2 } from '../lib/v2/client'
import { CommandSearch } from '../features/search'

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

function initials(name?: string | null, email?: string | null): string {
  const src = (name || email || '?').trim()
  const parts = src.split(/\s+/)
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

function navItem(isActive: boolean, collapsed: boolean) {
  return `flex items-center rounded-md text-sm font-medium transition-colors ${
    collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2'
  } ${isActive ? 'bg-ink text-paper' : 'text-muted hover:bg-brand-50 hover:text-ink'}`
}

const NAV_COLLAPSED_KEY = 'clinilytics.nav.collapsed'

export function Layout() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(NAV_COLLAPSED_KEY) === '1')
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(NAV_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  async function handleSignOut() {
    await signOut()
    if (demoMode) { window.location.hash = '#/login'; window.location.reload(); return }
    navigate('/login')
  }

  // Product nav, grouped to follow the hire workflow (open a role → source →
  // screen/match → offer → measure), filtered by the role's capabilities.
  const role = profile?.role ?? null
  type NavItem = { to: string; label: string; end?: boolean; cap: Capability; icon: LucideIcon }
  const navGroupDefs: { label?: string; items: NavItem[] }[] = [
    {
      items: [
        { to: '/', label: 'Dashboard', end: true, cap: 'view_dashboard', icon: LayoutDashboard },
        { to: '/autopilot', label: 'Autopilot', cap: 'view_dashboard', icon: Wand2 },
        { to: '/console', label: 'Console', cap: 'view_dashboard', icon: Terminal },
      ],
    },
    {
      label: 'Hire workflow',
      items: [
        { to: '/jobs', label: 'Jobs', cap: 'view_jobs', icon: Briefcase },
        { to: '/requests', label: 'Requests', cap: 'view_jobs', icon: FilePlus },
        { to: '/requisitions', label: 'Requisitions', cap: 'view_jobs', icon: FileText },
        { to: '/candidates', label: 'Candidates', cap: 'view_candidates', icon: UserRound },
        { to: '/sourcing', label: 'Sourcing', cap: 'view_candidates', icon: Radar },
        { to: '/referrals', label: 'Referrals', cap: 'view_candidates', icon: Gift },
        { to: '/screening', label: 'Screening', cap: 'view_candidates', icon: Bot },
        { to: '/inbox', label: 'Inbox', cap: 'view_candidates', icon: Inbox },
        { to: '/matching', label: 'Matching', cap: 'view_matching', icon: Sparkles },
        { to: '/offers', label: 'Offers', cap: 'view_candidates', icon: Handshake },
      ],
    },
    {
      label: 'Plan & setup',
      items: [
        { to: '/coverage', label: 'Coverage', cap: 'view_facilities', icon: Gauge },
        { to: '/facilities', label: 'Facilities', cap: 'view_facilities', icon: Building2 },
        { to: '/org-structure', label: 'Org structure', cap: 'view_facilities', icon: Network },
        { to: '/positions', label: 'Positions', cap: 'view_positions', icon: ClipboardList },
        { to: '/job-templates', label: 'Job templates', cap: 'view_positions', icon: FileText },
        { to: '/templates', label: 'Templates', cap: 'view_candidates', icon: MessageSquare },
      ],
    },
    {
      label: 'Measure',
      items: [
        { to: '/analytics', label: 'Analytics', cap: 'view_analytics', icon: BarChart3 },
        { to: '/finance', label: 'Finance', cap: 'view_analytics', icon: Wallet },
        { to: '/ad-campaigns', label: 'Job ads', cap: 'view_analytics', icon: Megaphone },
      ],
    },
    {
      label: 'Learn',
      items: [{ to: '/handbook', label: 'Handbook', cap: 'view_dashboard', icon: BookOpen }],
    },
  ]
  // v2-only routes (hidden until v2 is active) and legacy routes hidden under v2.
  const v2Only = ['/requests', '/requisitions', '/coverage', '/sourcing', '/referrals', '/inbox', '/templates', '/job-templates', '/org-structure', '/autopilot', '/console', '/screening', '/offers', '/finance', '/ad-campaigns', '/handbook']
  const v2Hidden = useV2 ? ['/jobs'] : []
  const navGroups = navGroupDefs
    .map((g) => ({
      label: g.label,
      items: g.items.filter((t) => roleCan(role, t.cap) && (!v2Only.includes(t.to) || useV2) && !v2Hidden.includes(t.to)),
    }))
    .filter((g) => g.items.length > 0)
  const adminLinks: { to: string; label: string; icon: LucideIcon }[] = [
    { to: '/team', label: 'Team', icon: Users },
    ...(useV2 ? [{ to: '/governance', label: 'Governance', icon: ShieldCheck }] : []),
    { to: '/import', label: 'Import', icon: Upload },
    { to: '/integrations', label: 'Integrations', icon: Plug },
    ...(!demoMode && !useV2 ? [{ to: '/setup', label: 'Cloud setup', icon: Database }] : []),
  ]

  // Nav body shared by the desktop sidebar and the mobile drawer. When
  // `collapsed`, render icon-only with tooltips (desktop rail).
  const renderNav = (onNavigate?: () => void, collapsed = false) => (
    <>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'pt-3' : ''}>
            {group.label &&
              (collapsed ? (
                <div className="mx-2 mb-1 border-t border-line" />
              ) : (
                <div className="px-3 pb-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
                  {group.label}
                </div>
              ))}
            {group.items.map(({ to, label, end, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onNavigate}
                title={collapsed ? label : undefined}
                className={({ isActive }) => navItem(isActive, collapsed)}
              >
                <Icon size={16} aria-hidden /> {!collapsed && label}
              </NavLink>
            ))}
          </div>
        ))}
        {isAdmin && (
          <div className="pt-4">
            {collapsed ? (
              <div className="mx-2 mb-1 border-t border-line" />
            ) : (
              <div className="px-3 pb-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
                Admin
              </div>
            )}
            {adminLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={onNavigate}
                title={collapsed ? label : undefined}
                className={({ isActive }) => navItem(isActive, collapsed)}
              >
                <Icon size={16} aria-hidden /> {!collapsed && label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      <div className="mt-auto border-t border-line p-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              title={`${profile?.full_name || profile?.email} · ${roleLabel(profile?.role)}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-ink"
            >
              {initials(profile?.full_name, profile?.email)}
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-muted hover:bg-brand-50 hover:text-ink"
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 px-1 py-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-ink">
                {initials(profile?.full_name, profile?.email)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{profile?.full_name || profile?.email}</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{roleLabel(profile?.role)}</div>
              </div>
            </div>
            <button onClick={handleSignOut} className="btn-secondary mt-2 w-full justify-center py-1.5">
              <LogOut size={15} /> Sign out
            </button>
          </>
        )}
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <DemoBanner />

      <div className="flex flex-1">
        {/* ── Left nav (desktop) — collapsible to an icon rail ── */}
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 md:flex ${
            collapsed ? 'w-16' : 'w-60'
          }`}
        >
          <div className={`flex h-12 items-center border-b border-line ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
            {!collapsed && <Wordmark />}
            <button
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-brand-50 hover:text-ink"
            >
              {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            </button>
          </div>
          {renderNav(undefined, collapsed)}
        </aside>

        {/* ── Left nav (mobile drawer) ── */}
        {open && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
            <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-xl">
              <div className="flex h-12 items-center justify-between border-b border-line px-4">
                <Wordmark />
                <button onClick={() => setOpen(false)} aria-label="Close menu" className="text-muted hover:text-ink">
                  <X size={20} />
                </button>
              </div>
              {renderNav(() => setOpen(false))}
            </aside>
          </div>
        )}

        {/* ── Main column ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
            <div className="flex h-12 items-center gap-3 px-4">
              <button className="text-muted md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
                <Menu size={22} />
              </button>

              <CommandSearch />

              <div className="ml-auto flex items-center gap-2">
                <a
                  href="#/careers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-brand-50 hover:text-ink sm:inline-flex"
                  title="Open the public careers page"
                >
                  <Briefcase size={14} /> Careers page
                </a>
                {useV2 && (
                  <a
                    href="#/staffing-request"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-brand-50 hover:text-ink sm:inline-flex"
                    title="Open the public staffing-request page for facility managers"
                  >
                    <FilePlus size={14} /> Facility request
                  </a>
                )}
                <span className="hidden items-center gap-1.5 px-1.5 text-sm text-muted sm:inline-flex">
                  <span className={`h-2 w-2 rounded-full ${demoMode ? 'bg-clay-500' : 'bg-sage-500'}`} />
                  {demoMode ? 'Local' : 'Live'}
                </span>
                {isAdmin && (
                  <NavLink
                    to={useV2 || demoMode ? '/team' : '/setup'}
                    title="Settings"
                    className={({ isActive }) =>
                      `inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface hover:bg-brand-50 ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`
                    }
                  >
                    <Settings size={16} />
                  </NavLink>
                )}
              </div>
            </div>
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
      </div>
    </div>
  )
}
