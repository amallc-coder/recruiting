import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Facilities } from './pages/Facilities'
import { FacilityDetail } from './pages/FacilityDetail'
import { Candidates } from './pages/Candidates'
import { Matching } from './pages/Matching'
import { Positions } from './pages/Positions'
// Lazy-loaded: pulls in the SheetJS parser only when the Import screen is opened.
const Import = lazy(() => import('./pages/Import').then((m) => ({ default: m.Import })))
import { Team } from './pages/Team'

// HashRouter keeps deep links working on GitHub Pages (no server-side routing).
export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
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
            <Route path="/matching" element={<Matching />} />
            <Route path="/positions" element={<Positions />} />
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
    </AuthProvider>
  )
}
