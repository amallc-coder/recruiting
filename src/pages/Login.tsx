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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-gray-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            R
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Recruiting Tracker</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
        </div>

        {!isSupabaseConfigured && (
          <div className="card mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
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
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="relative py-1 text-center">
            <span className="bg-white px-2 text-xs text-gray-400">or</span>
            <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-gray-100" />
          </div>

          <button type="button" className="btn-secondary w-full" onClick={startDemo}>
            Start in local mode (no setup yet) →
          </button>
          <p className="text-center text-xs text-gray-400">
            Use the full app now with your facilities preloaded. Data saves in this
            browser; export it to Supabase anytime to go live.
          </p>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">
          Accounts are created by your administrator. Contact them if you can't sign in.
        </p>
      </div>
    </div>
  )
}
