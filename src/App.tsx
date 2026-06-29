import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './components/primitives'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Careers } from './pages/Careers'
import { Dashboard } from './pages/Dashboard'
import { Facilities } from './pages/Facilities'
import { FacilityDetail } from './pages/FacilityDetail'
import { Candidates } from './pages/Candidates'
import { Jobs } from './pages/Jobs'
import { JobDetail } from './pages/JobDetail'
import { Analytics } from './pages/Analytics'
import { Matching } from './pages/Matching'
import { Positions } from './pages/Positions'
import { Integrations } from './pages/Integrations'
import { ApiDocs } from './pages/ApiDocs'
import { Setup } from './pages/Setup'
// Lazy-loaded: pulls in the SheetJS parser only when the Import screen is opened.
const Import = lazy(() => import('./pages/Import').then((m) => ({ default: m.Import })))
import { Team } from './pages/Team'
import { RequisitionsPage, RequisitionDetail } from './features/requisitions'
import { CoveragePage } from './features/coverage'
import { v2IsBranch } from './lib/v2/client'

// HashRouter keeps deep links working on GitHub Pages (no server-side routing).
export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Public career page — no authentication required. */}
          <Route path="/careers" element={<Careers />} />
          <Route path="/careers/:slug" element={<Careers />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/facilities" element={<Facilities />} />
            <Route path="/facilities/:id" element={<FacilityDetail />} />
            <Route path="/candidates" element={<Candidates />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/matching" element={<Matching />} />
            <Route path="/positions" element={<Positions />} />
            {v2IsBranch && (
              <>
                <Route path="/requisitions" element={<RequisitionsPage />} />
                <Route path="/requisitions/:id" element={<RequisitionDetail />} />
                <Route path="/coverage" element={<CoveragePage />} />
              </>
            )}
            <Route
              path="/import"
              element={
                <ProtectedRoute adminOnly>
                  <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading importer…</div>}>
                    <Import />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/integrations"
              element={
                <ProtectedRoute adminOnly>
                  <Integrations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/api-docs"
              element={
                <ProtectedRoute adminOnly>
                  <ApiDocs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/setup"
              element={
                <ProtectedRoute adminOnly>
                  <Setup />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team"
              element={
                <ProtectedRoute adminOnly>
                  <Team />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
