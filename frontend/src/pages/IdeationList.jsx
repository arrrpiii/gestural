import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import IdeationItem from '../components/IdeationItem.jsx'

export default function IdeationList() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(null)

  useEffect(() => {
    api.listIdeations()
      .then(setItems)
      .catch((e) => setError(e.message))
  }, [])

  // Close the modal on Escape.
  useEffect(() => {
    if (!openId) return
    function onKey(e) {
      if (e.key === 'Escape') setOpenId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId])

  async function handleDelete(id) {
    if (!confirm('Delete this ideation?')) return
    try {
      await api.deleteIdeation(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
      if (openId === id) setOpenId(null)
    } catch (e) {
      setError(e.message)
    }
  }

  const openItem = openId ? items.find((i) => i.id === openId) : null

  if (error) return <p className="error">{error}</p>
  if (items === null) return <p className="muted">Loading…</p>

  return (
    <div className="stack">
      <h1 className="page-title">Your ideations</h1>
      {items.length === 0 ? (
        <div className="empty">
          You haven't generated any ideas yet. Head to the <Link to="/dashboard">dashboard</Link> to start.
        </div>
      ) : (
        <div className="ideation-list">
          {items.map((it) => (
            <motion.button
              key={it.id}
              type="button"
              className="neu ideation-summary ideation-summary-clickable"
              onClick={() => setOpenId(it.id)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              whileHover={{ y: -2 }}
              aria-label={`Open ideation: ${it.prompt}`}
            >
              <span className="date">{new Date(it.created_at).toLocaleString()}</span>
              <p className="prompt">{it.prompt}</p>
              <span className="open-hint">Click to view →</span>
            </motion.button>
          ))}
        </div>
      )}

      {/* Modal ---------------------------------------------------- */}
      <AnimatePresence>
        {openItem && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpenId(null)}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              className="modal-panel neu"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-head">
                <div>
                  <span className="modal-eyebrow">Ideation</span>
                  <h2 className="modal-title">{openItem.prompt}</h2>
                  <span className="modal-date">
                    {new Date(openItem.created_at).toLocaleString()}
                  </span>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setOpenId(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <IdeationItem items={openItem.items} />
              </div>

              <div className="modal-foot">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleDelete(openItem.id)}
                >
                  Delete ideation
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setOpenId(null)}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}