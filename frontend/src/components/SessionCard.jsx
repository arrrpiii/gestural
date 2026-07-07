import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function SessionCard({ session }) {
  const date = session.created_at
    ? new Date(session.created_at).toLocaleString()
    : ''
  const name = (session.name || '').trim() || 'Untitled session'
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
      <Link to={`/history/${session.id}`} className="neu session-card">
        <div className="session-thumb">
          {session.thumbnail ? (
            <img src={session.thumbnail} alt="" loading="lazy" />
          ) : (
            <div className="session-thumb-placeholder">
              <span>●</span>
            </div>
          )}
        </div>
        <div className="session-card-body">
          <span className="session-card-name">{name}</span>
          <span className="session-date">{date}</span>
        </div>
      </Link>
    </motion.div>
  )
}