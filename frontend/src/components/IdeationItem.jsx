import { motion } from 'framer-motion'

const row = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
}

const stagger = {
  animate: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
}

/**
 * Renders one ideation as a list of {text -> arrow -> gesture} rows.
 */
export default function IdeationItem({ items }) {
  if (!items || items.length === 0) {
    return <p className="muted">No ideas generated yet.</p>
  }
  return (
    <motion.div className="ideation-result" variants={stagger} initial="initial" animate="animate">
      {items.map((it, i) => (
        <motion.div className="ideation-row" key={i} variants={row}>
          <motion.div className="neu ideation-cell text" variants={row}>
            <span className="label">Script</span>
            <h4>{it.text}</h4>
          </motion.div>
          <div className="arrow">→</div>
          <motion.div className="neu ideation-cell gesture" variants={row}>
            <span className="label">Gesture</span>
            <h4>{it.gesture}</h4>
          </motion.div>
        </motion.div>
      ))}
    </motion.div>
  )
}
