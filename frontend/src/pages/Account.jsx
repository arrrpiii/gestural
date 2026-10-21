import { useAuth } from '../context/AuthContext.jsx'

export default function Account() {
  const { user, logout } = useAuth()
  return <section className="account-page stack">
    <h1>Account</h1>
    <dl className="account-details"><div><dt>Name</dt><dd>{user.name || 'Not provided'}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div></dl>
    <div><button className="btn" onClick={logout}>Log out</button></div>
  </section>
}
