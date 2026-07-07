import { motion } from 'framer-motion'

export default function About() {
  return (
    <motion.div
      className="neu prose-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <h2>About Gestural</h2>
      <div className="profile">
        <div className="avatar">AT</div>
        <div>
          <h3 style={{ marginBottom: 2 }}>Arpit Thakur</h3>
          <div className="meta">IIT Patna · Noida, India</div>
        </div>
      </div>
      <p>
        Gestural is a solo project by Arpit Thakur — a builder and student at IIT Patna,
        currently based in Noida. The idea came from his own frustration with recording
        himself over and over, wading through a flooded camera roll, and never quite
        knowing which take was actually better.
      </p>
      <p>
        Gestural is the workflow he wished he had: pair every script idea with a body
        movement, rehearse on camera, and let a coach (an AI one, in this case) tell
        you what to fix in seconds.
      </p>
      <h2>What this site is</h2>
      <p>
        A focused practice tool for content creators. Nothing more, nothing less. No
        community feed, no scheduling, no public profile. Just you, the script, the
        camera, and the review.
      </p>
    </motion.div>
  )
}
