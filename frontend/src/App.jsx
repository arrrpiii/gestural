import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { useAuth } from './context/AuthContext.jsx'
import Nav from './components/Nav.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Album from './pages/Album.jsx'
import Practice from './pages/Practice.jsx'
import History from './pages/History.jsx'
import IdeationList from './pages/IdeationList.jsx'
import Account from './pages/Account.jsx'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <p role="status">Loading</p>
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  return children
}
function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  const requested = location.state?.from
  const destination = requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/albums'
  if (loading) return <p role="status">Loading</p>
  return user ? <Navigate to={destination} replace /> : children
}
function LegacyRedirect({ to }) {
  const location = useLocation()
  return <Navigate to={to + location.search} replace />
}
export default function App() {
  const location = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    const title = location.pathname.startsWith('/albums') ? 'Albums' : location.pathname.startsWith('/scripts') ? 'Scripts' : location.pathname === '/record' ? 'Record' : location.pathname.startsWith('/history') ? 'Review' : location.pathname === '/' ? 'Home' : location.pathname === '/login' ? 'Log in' : location.pathname === '/register' ? 'Create account' : 'Account'
    document.title = `${title} — Gestural`
  }, [location.pathname])
  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <Nav />
        <main id="main" tabIndex={-1} className="app-main page-enter" key={location.pathname}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/albums" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/albums/:id" element={<ProtectedRoute><Album /></ProtectedRoute>} />
            <Route path="/scripts" element={<ProtectedRoute><IdeationList /></ProtectedRoute>} />
            <Route path="/record" element={<ProtectedRoute><Practice /></ProtectedRoute>} />
            <Route path="/history/:id" element={<ProtectedRoute><History /></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
            <Route path="/dashboard" element={<LegacyRedirect to="/albums" />} />
            <Route path="/ideation" element={<LegacyRedirect to="/scripts" />} />
            <Route path="/practice" element={<LegacyRedirect to="/record" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </MotionConfig>
  )
}
