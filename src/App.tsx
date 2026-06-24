import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Openings } from './pages/Openings'
import { Candidates } from './pages/Candidates'
import { Team } from './pages/Team'

// HashRouter keeps deep links (e.g. /#/openings) working on GitHub Pages,
// which can't do server-side routing for a static site.
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
            <Route path="/openings" element={<Openings />} />
            <Route path="/candidates" element={<Candidates />} />
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
