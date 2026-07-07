import { motion } from 'framer-motion'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Nav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  function handleLogout() {
    logout()
    navigate('/')
  }

  // For in-page anchors: if already on home, smooth scroll without reloading.
  // If on another page, navigate to home first and let the hash trigger a scroll.
  function handleAnchor(e, id) {
    e.preventDefault()
    if (location.pathname === '/') {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      navigate('/', { state: { scrollTo: id } })
    }
  }

  return (
    <motion.nav
      className="nav"
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="nav-inner">
        <Link to="/" className="brand">⌬ GESTURAL</Link>
        <div className="nav-links">
          {!user && (
            <>
              <a href="/#features" onClick={(e) => handleAnchor(e, 'features')}>Features</a>
              <a href="/#details" onClick={(e) => handleAnchor(e, 'details')}>How it works</a>
              <a href="/#pricing" onClick={(e) => handleAnchor(e, 'pricing')}>Pricing</a>
            </>
          )}
          {user && (
            <>
              <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
                Dashboard
              </NavLink>
              <NavLink to="/ideation" className={({ isActive }) => (isActive ? 'active' : '')}>
                Ideations
              </NavLink>
            </>
          )}
        </div>
        <div className="nav-cta">
          {user ? (
            <>
              <span className="muted" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                {user.name || user.email}
              </span>
              <button className="btn btn-ghost" onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary">Log in</Link>
          )}
        </div>
      </div>
    </motion.nav>
  )
}
