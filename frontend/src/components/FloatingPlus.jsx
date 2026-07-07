import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

export default function FloatingPlus() {
  return (
    <motion.div
      style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 50 }}
    >
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width: 64, height: 64, borderRadius: '50%' }}
      >
        <Link to="/practice" className="fab" aria-label="Create new practice session">
          +
        </Link>
      </motion.div>
    </motion.div>
  )
}
