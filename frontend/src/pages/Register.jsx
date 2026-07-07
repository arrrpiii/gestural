import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'

export default function Register() {
  const { register, error } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLocalError(null)
    setSubmitting(true)
    try {
      await register(email, password, name)
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
      <h2>Create your studio</h2>
      <p className="sub">Start practicing in under a minute.</p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field-label" htmlFor="name">Name</label>
          <input
            id="name"
            className="input"
            type="text"
            required
            minLength={1}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
        </div>
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
            placeholder="At least 6 characters"
            autoComplete="new-password"
          />
        </div>
        {(localError || error) && <p className="error">{localError || error}</p>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="auth-alt">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </motion.div>
  )
}
