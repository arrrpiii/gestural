import { motion } from 'framer-motion'

export default function WhyUs() {
  return (
    <motion.div
      className="neu prose-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <h2>Why Gestural</h2>
      <p>
        Recording yourself is the fastest way to get better on camera. It is also the
        fastest way to drown in your own footage. You record a take, watch it, hate
        something, record again, watch it, hate something else, and the gallery fills
        up with twenty versions of the same line. By the end of the session you do
        not know which one was best, what you actually fixed, or what to work on next.
      </p>

      <h2>What changes here</h2>
      <p>
        Gestural replaces the rewatch loop with a one-step review. You record a take,
        and a Gemini-powered coach watches the video AND listens to the audio —
        picking up on eye contact, gesture size, vocal pace, filler words, energy,
        and visual hooks in one pass.
      </p>
      <p>
        Every review now lands with a <strong>timestamped timeline</strong>: red
        markers appear at the exact moments that need work. Hover any marker to
        read the specific note; click it to jump the video straight to that
        second. No more scrubbing back and forth trying to find the bit you
        hated.
      </p>
      <p>
        Alongside the timeline you get two short cards — <strong>Strengths</strong> and{' '}
        <strong>Specific Drills</strong> — so you leave each session knowing what to keep
        doing and what to drill next. Old reviews can be re-run from the session page to
        pick up the new timestamped format, and every take can be renamed or deleted as
        you go.
      </p>

      <h2>What it saves you</h2>
      <p>
        Time. Disk space. And the feeling of doom-scrolling your own face at 1am
        trying to figure out if your hands are weird.
      </p>
    </motion.div>
  )
}