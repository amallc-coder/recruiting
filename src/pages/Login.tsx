import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import { enableDemo } from '../lib/demo'

function startDemo() {
  enableDemo()
  window.location.hash = '#/'
  window.location.reload()
}

export function Login() {
  const { session, signIn, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session && !loading) return <Navigate to="/" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(email.trim(), password)
    if (error) setError(error)
    setSubmitting(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4 text-ink">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ink">
            <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
              <rect x="6" y="17" width="4" height="9" rx="1.4" fill="#6e9a6a" />
              <rect x="14" y="11" width="4" height="15" rx="1.4" fill="#cd7c4f" />
              <rect x="22" y="7" width="4" height="19" rx="1.4" fill="#f4f1ea" />
            </svg>
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            clinilytics <span className="font-mono text-sm uppercase tracking-[0.14em] text-muted">ATS</span>
          </h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Sign in to your account</p>
        </div>

        {!isSupabaseConfigured && (
          <div className="card mb-4 p-4 text-sm text-clay-600">
            <strong>Not connected yet.</strong> The app's Supabase credentials
            (<code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code>) are not
            set. See the README to finish setup.
          </div>
        )}

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="rounded-lg bg-rust-50 px-3 py-2 text-sm text-rust-500">{error}</div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="relative py-1 text-center">
            <span className="bg-surface px-2 font-mono text-[10px] uppercase tracking-widest text-muted">or</span>
            <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-line" />
          </div>

          <button type="button" className="btn-secondary w-full" onClick={startDemo}>
            Start in local mode (no setup yet) →
          </button>
          <p className="text-center text-xs text-muted">
            Use the full app now with the facility list, openings, and positions preloaded.
            Data saves in this browser; export to Supabase anytime to go live.
          </p>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          Accounts are created by your administrator. Contact them if you can't sign in.
        </p>
      </div>
    </div>
  )
}
