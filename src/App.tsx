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
import { ScreeningsPage } from './features/screening'
import { PositionsPage as V2Positions } from './features/positions'
import { IntegrationsPage as V2Integrations } from './features/integrations'
import { OffersPage } from './features/offers'
import { FinancePage } from './features/finance'
import { DashboardPage as V2Dashboard } from './features/dashboard'
import { CandidatesPage as V2Candidates, CandidateProfile } from './features/candidates'
import { FacilitiesPage as V2Facilities } from './features/facilities'
import { CareersPage as V2Careers } from './features/careers'
import { AnalyticsPage as V2Analytics } from './features/analytics'
import { MatchingPage as V2Matching } from './features/matching'
// Lazy-loaded for the same reason as the old importer: keep SheetJS out of the main bundle.
const V2Import = lazy(() => import('./features/import').then((m) => ({ default: m.ImportPage })))
import { useV2 } from './lib/v2/client'

// HashRouter keeps deep links working on GitHub Pages (no server-side routing).
export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Public career page — no authentication required. Swaps to v2 intake. */}
          <Route path="/careers" element={useV2 ? <V2Careers /> : <Careers />} />
          <Route path="/careers/:slug" element={useV2 ? <V2Careers /> : <Careers />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={useV2 ? <V2Dashboard /> : <Dashboard />} />
            <Route path="/facilities" element={useV2 ? <V2Facilities /> : <Facilities />} />
            {/* FacilityDetail is still old-schema; unreachable from the v2 facilities nav. */}
            <Route path="/facilities/:id" element={<FacilityDetail />} />
            <Route path="/candidates" element={useV2 ? <V2Candidates /> : <Candidates />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/analytics" element={useV2 ? <V2Analytics /> : <Analytics />} />
            <Route path="/matching" element={useV2 ? <V2Matching /> : <Matching />} />
            {/* Positions swaps to the v2 catalog when pointed at a v2 branch. */}
            <Route path="/positions" element={useV2 ? <V2Positions /> : <Positions />} />
            {useV2 && (
              <>
                <Route path="/candidates/:id" element={<CandidateProfile />} />
                <Route path="/requisitions" element={<RequisitionsPage />} />
                <Route path="/requisitions/:id" element={<RequisitionDetail />} />
                <Route path="/coverage" element={<CoveragePage />} />
                <Route path="/screening" element={<ScreeningsPage />} />
                <Route path="/offers" element={<OffersPage />} />
                <Route path="/finance" element={<FinancePage />} />
              </>
            )}
            <Route
              path="/import"
              element={
                <ProtectedRoute adminOnly>
                  <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading importer…</div>}>
                    {useV2 ? <V2Import /> : <Import />}
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/integrations"
              element={
                <ProtectedRoute adminOnly>
                  {useV2 ? <V2Integrations /> : <Integrations />}
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
