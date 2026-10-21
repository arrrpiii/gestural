import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Nav() {
  const { user } = useAuth()
  return (
    <header className="nav">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="nav-inner">
        <Link to="/" className="brand">Gestural</Link>
        <nav className="nav-links" aria-label="Main navigation">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/albums">Albums</NavLink>
          <NavLink to="/scripts">Scripts</NavLink>
        </nav>
        <div className="nav-cta">
          <NavLink to={user ? '/account' : '/login'}>{user ? 'Account' : 'Log in'}</NavLink>
        </div>
      </div>
    </header>
  )
}
