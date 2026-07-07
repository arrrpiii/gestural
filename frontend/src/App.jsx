import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from './context/AuthContext.jsx'

import Nav from './components/Nav.jsx'
import Footer from './components/Footer.jsx'
import FloatingPlus from './components/FloatingPlus.jsx'

import Home from './pages/Home.jsx'
import About from './pages/About.jsx'
import WhyUs from './pages/WhyUs.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Practice from './pages/Practice.jsx'
import History from './pages/History.jsx'
import IdeationList from './pages/IdeationList.jsx'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="app-main" style={{ textAlign: 'center', paddingTop: 80 }}>
        <p className="muted">Loading…</p>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="app-main" style={{ textAlign: 'center', paddingTop: 80 }}>
        <p className="muted">Loading…</p>
      </div>
    )
  }
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

function PageWrap({ children }) {
  return (
    <motion.main
      className="app-main"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {children}
    </motion.main>
  )
}

export default function App() {
  const { user } = useAuth()
  const location = useLocation()

  return (
    <div className="app">
      <Nav />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<PageWrap><Home /></PageWrap>} />
          <Route path="/about" element={<PageWrap><About /></PageWrap>} />
          <Route path="/why-us" element={<PageWrap><WhyUs /></PageWrap>} />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <PageWrap><Login /></PageWrap>
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <PageWrap><Register /></PageWrap>
              </PublicRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <PageWrap><Dashboard /></PageWrap>
              </ProtectedRoute>
            }
          />
          <Route
            path="/practice"
            element={
              <ProtectedRoute>
                <PageWrap><Practice /></PageWrap>
              </ProtectedRoute>
            }
          />
          <Route
            path="/history/:id"
            element={
              <ProtectedRoute>
                <PageWrap><History /></PageWrap>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ideation"
            element={
              <ProtectedRoute>
                <PageWrap><IdeationList /></PageWrap>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
      {user && <FloatingPlus />}
      <Footer />
    </div>
  )
}
