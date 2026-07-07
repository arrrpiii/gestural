import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
}

const features = [
  {
    title: 'AI Ideation',
    body: 'Describe your topic. Get a tight script paired with the gestures, posture, and visual hooks that sell it.',
  },
  {
    title: 'Webcam Rehearsal',
    body: 'Record yourself directly in the browser. No installs, no exports, no clutter in your camera roll.',
  },
  {
    title: 'Multimodal Review',
    body: 'Gemini-powered coach reviews your gestures, energy, and facial expression line by line.',
  },
  {
    title: 'Session History',
    body: 'Every practice sits in one place. Replay, re-review, and delete anything you don\'t need.',
  },
]

const steps = [
  { num: '01', title: 'Get an idea', body: 'Type a topic in the dashboard. The AI returns a short script with paired gestures.' },
  { num: '02', title: 'Record yourself', body: 'Hit the plus button, pick a reference, and record. The webcam does the rest.' },
  { num: '03', title: 'Get reviewed', body: 'A coach-style review lands in seconds with strengths, improvements, and drills.' },
]

export default function Home() {
  const location = useLocation()
  const { user } = useAuth()

  // When the nav links send us here from another page (e.g. /about → #features),
  // honour the requested section by smooth-scrolling once the page mounts.
  useEffect(() => {
    const target = location.state?.scrollTo
    if (!target) return
    // Small delay so the page transition has settled before we scroll.
    const id = setTimeout(() => {
      const el = document.getElementById(target)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
    return () => clearTimeout(id)
  }, [location.state])

  return (
    <>
      {!user && (
        <>
          <section className="home-hero scanlines">
            <motion.h1 variants={fadeUp} initial="initial" animate="animate" transition={{ duration: 0.5 }}>
              Practice gestures<br />like an athlete.
            </motion.h1>
            <motion.p className="tagline" variants={fadeUp} initial="initial" animate="animate" transition={{ duration: 0.5, delay: 0.1 }}>
              Gestural turns your webcam into a coaching studio. Plan the script, record the take,
              and get instant feedback on body language, energy, and visual hooks.
            </motion.p>
            <motion.div className="cta-row" variants={fadeUp} initial="initial" animate="animate" transition={{ duration: 0.5, delay: 0.2 }}>
              <Link to="/register" className="btn btn-primary">Get started</Link>
              <a href="#features" className="btn">See features</a>
            </motion.div>
          </section>

          <section className="section" id="features">
            <div className="section-head">
              <span className="eyebrow">Features</span>
              <h2>Built for creators who want better takes</h2>
              <p>Four tools that close the loop between idea, rehearsal, and improvement.</p>
            </div>
            <div className="feature-grid">
              {features.map((f) => (
                <motion.div
                  key={f.title}
                  className="neu feature-card"
                  whileHover={{ y: -2 }}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.3 }}
                >
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </motion.div>
              ))}
            </div>
          </section>
        </>
      )}

      {user && (
        <section className="home-hero">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}
          >
            Welcome back, {user.name || user.email}.
          </motion.h1>
          <motion.p
            className="tagline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            Jump back into the studio or read what's new below.
          </motion.p>
          <motion.div
            className="cta-row"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Link to="/dashboard" className="btn btn-primary">Open dashboard</Link>
            <Link to="/practice" className="btn">New practice</Link>
          </motion.div>
        </section>
      )}

      <section className="section" id="details">
        <div className="section-head">
          <span className="eyebrow">How it works</span>
          <h2>Three steps to a sharper take</h2>
        </div>
        <div className="steps">
          {steps.map((s) => (
            <motion.div
              key={s.num}
              className="neu step"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.3 }}
            >
              <span className="num">{s.num}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="section" id="pricing">
        <div className="section-head">
          <span className="eyebrow">
            Pricing{' '}
            <span style={{ color: 'var(--text-mute)', textTransform: 'none', letterSpacing: '0.06em', fontSize: '0.7rem' }}>
              (fake for now)
            </span>
          </span>
          <h2>Pick a plan. Practice as much as you want.</h2>
          <p>
            Prices are placeholders while we are in early access. Start free and
            upgrade whenever you want longer takes or a deeper review.
          </p>
        </div>
        <div className="pricing-grid">
          <motion.div
            className="neu pricing-card"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.3 }}
            whileHover={{ y: -2 }}
          >
            <span className="tier">Free <small className="fake">(fake)</small></span>
            <div className="price">$0<small>/forever</small></div>
            <p className="desc">Everything you need to start practising on camera today.</p>
            <ul>
              <li>20 practice sessions per month</li>
              <li>Up to 60 seconds per recording</li>
              <li>AI ideation with 5 ideas per prompt</li>
              <li>Standard coach review</li>
              <li>30-day session history</li>
            </ul>
            <div className="cta">
              <Link to="/register" className="btn">Start free</Link>
            </div>
          </motion.div>

          <motion.div
            className="neu pricing-card featured"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            whileHover={{ y: -2 }}
          >
            <span className="tier">Regular <small className="fake">(fake)</small></span>
            <div className="price">$9<small>/month</small></div>
            <p className="desc">For creators practising consistently who want deeper feedback.</p>
            <ul>
              <li>Unlimited practice sessions</li>
              <li>Up to 2 minutes per recording</li>
              <li>AI ideation with 7 ideas per prompt</li>
              <li>Detailed coach review with drills</li>
              <li>Unlimited session history</li>
              <li>Priority review queue</li>
            </ul>
            <div className="cta">
              <Link to="/register" className="btn btn-primary">Go Regular</Link>
            </div>
          </motion.div>

          <motion.div
            className="neu pricing-card"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            whileHover={{ y: -2 }}
          >
            <span className="tier">Pro <small className="fake">(fake)</small></span>
            <div className="price">$29<small>/month</small></div>
            <p className="desc">For teams and creators running multiple channels.</p>
            <ul>
              <li>Everything in Regular</li>
              <li>Up to 5 minute recordings</li>
              <li>Side-by-side A/B review of takes</li>
              <li>Multi-speaker coaching personas</li>
              <li>Export reviews as PDFs</li>
              <li>Team workspace (up to 5 seats)</li>
            </ul>
            <div className="cta">
              <Link to="/register" className="btn">Go Pro</Link>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  )
}
