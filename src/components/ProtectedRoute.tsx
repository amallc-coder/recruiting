import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Spinner } from './ui'

export function ProtectedRoute({
  children,
  adminOnly,
}: {
  children: ReactNode
  adminOnly?: boolean
}) {
  const { session, profile, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  // Profile row may still be propagating right after first sign-in.
  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Setting up your account…" />
      </div>
    )
  }

  if (adminOnly && !isAdmin) return <Navigate to="/" replace />

  return <>{children}</>
}
