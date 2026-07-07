import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { login, error } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLocalError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setLocalError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <motion.div
      className="neu auth-wrap"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h2>Welcome back</h2>
      <p className="sub">Log in to your practice studio.</p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field-label" htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>
        {(localError || error) && <p className="error">{localError || error}</p>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="auth-alt">
        New here? <Link to="/register">Create an account</Link>
      </p>
    </motion.div>
  )
}
