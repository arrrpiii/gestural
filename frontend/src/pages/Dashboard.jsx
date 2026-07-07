import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../api.js'
import IdeationItem from '../components/IdeationItem.jsx'
import SessionCard from '../components/SessionCard.jsx'

export default function Dashboard() {
  const [prompt, setPrompt] = useState('')
  const [ideation, setIdeation] = useState(null) // {items, prompt}
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sessions, setSessions] = useState([])

  useEffect(() => {
    api.listSessions().then(setSessions).catch(() => setSessions([]))
  }, [])

  async function generate() {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.createIdeation(prompt.trim())
      setIdeation({ items: result.items, prompt: result.prompt })
      setPrompt('')
    } catch (e) {
      setError(e.message || 'Could not generate ideas. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function restart() {
    setIdeation(null)
    setPrompt('')
    setError(null)
  }

  return (
    <div className="stack" style={{ gap: 'var(--gap-5)' }}>
      <h1 className="page-title">Dashboard</h1>

      {/* 1. Ideation ------------------------------------------------- */}
      <motion.section
        className="neu"
        style={{ padding: 'var(--gap-4)' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="section-title">Idea recommendations</h2>
        <p className="muted" style={{ marginBottom: 'var(--gap-3)', fontSize: '0.9rem' }}>
          Describe your topic. You'll get a short script with paired gestures. One prompt per session.
        </p>

        {!ideation ? (
          <div className="ideation-prompt">
            <textarea
              className="textarea"
              placeholder="e.g. A 30-second pitch for a productivity app that targets college students"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              disabled={loading}
            />
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={generate} disabled={!prompt.trim() || loading}>
                {loading ? 'Generating…' : 'Generate ideas'}
              </button>
              {error && <p className="error" style={{ marginLeft: 8 }}>{error}</p>}
            </div>
          </div>
        ) : (
          <>
            <IdeationItem items={ideation.items} />
            <div className="row" style={{ marginTop: 'var(--gap-3)' }}>
              <button className="btn" onClick={restart}>Restart session</button>
              <a
                className="btn btn-ghost"
                href={`/ideation`}
                onClick={(e) => e.stopPropagation()}
              >
                View all ideations
              </a>
            </div>
          </>
        )}
      </motion.section>

      {/* 2. History -------------------------------------------------- */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <h2 className="section-title">Previous practice sessions</h2>
        {sessions.length === 0 ? (
          <div className="empty">
            No sessions yet. Hit the <span style={{ color: 'var(--neon-cyan)' }}>+</span> button to start.
          </div>
        ) : (
          <div className="sessions-grid">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        )}
      </motion.section>
    </div>
  )
}