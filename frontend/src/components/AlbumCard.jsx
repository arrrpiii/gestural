import { motion } from 'framer-motion'

/**
 * Album cover card. Mirrors SessionCard visually, but the click target is a
 * callback (the Dashboard uses it to open an album-detail modal) and the
 * subtitle shows the session count.
 */
export default function AlbumCard({ album, onOpen }) {
  const date = album.created_at
    ? new Date(album.created_at).toLocaleString()
    : ''
  const name = (album.name || '').trim() || 'Untitled album'
  const count = album.session_count ?? 0
  return (
    <motion.button
      type="button"
      className="neu session-card album-card"
      onClick={() => onOpen?.(album)}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      aria-label={`Open album: ${name}`}
    >
      <div className="session-thumb">
        {album.latest_thumbnail ? (
          <img src={album.latest_thumbnail} alt="" loading="lazy" />
        ) : (
          <div className="session-thumb-placeholder">
            <span>●</span>
          </div>
        )}
      </div>
      <div className="session-card-body">
        <span className="session-card-name">{name}</span>
        <span className="session-date">{date}</span>
        <span className="album-count-line">
          {count} take{count === 1 ? '' : 's'}
        </span>
      </div>
    </motion.button>
  )
}
