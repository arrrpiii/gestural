import { motion } from 'framer-motion'

export default function About() {
  return (
    <motion.div
      className="neu prose-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <h2>About Us</h2>
      <p>yet to come…</p>
    </motion.div>
  )
}
