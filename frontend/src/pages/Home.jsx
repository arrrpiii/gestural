import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Home() {
  const { user } = useAuth()
  return (
    <div className="home-page">
      <section className="home-intro">
        <h1>Get comfortable on camera.</h1>
        <p>Write a script, record a take, and see what to improve.</p>
        <Link to={user ? '/record' : '/register'} className="btn btn-primary">
          {user ? 'Record a take' : 'Get started'}
        </Link>
      </section>
      <div className="home-workspace">
        <section className="home-row">
          <div><h2>Your practice, in one place.</h2><p>Keep takes together and compare your progress.</p></div>
          <Link to="/albums" className="text-link">Open albums <span aria-hidden="true">→</span></Link>
        </section>
        <section className="home-row">
          <div><h2>Start with something to say.</h2><p>Turn a topic into a script with delivery cues.</p></div>
          <Link to="/scripts" className="text-link">Open scripts <span aria-hidden="true">→</span></Link>
        </section>
      </div>
    </div>
  )
}
