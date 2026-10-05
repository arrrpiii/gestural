import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api, getToken } from '../api.js'
import IdeationItem from '../components/IdeationItem.jsx'

/**
 * Convert a small subset of inline markdown (**bold**, *italic*, `code`) into
 * React nodes. Anything else passes through as text.
 */
function renderInline(text) {
  if (!text) return null
  let cleaned = text.trim()
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim()
  }
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  const out = []
  let last = 0
  let m
  let key = 0
  while ((m = regex.exec(cleaned)) !== null) {
    if (m.index > last) out.push(cleaned.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('**')) {
      out.push(<strong key={key++}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      out.push(<code key={key++}>{token.slice(1, -1)}</code>)
    } else {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>)
    }
    last = regex.lastIndex
  }
  if (last < cleaned.length) out.push(cleaned.slice(last))
  return out
}

/**
 * Parse a timestamp string like "0:05" or "1:23" into seconds.
 */
function tsToSeconds(s) {
  s = s.trim()
  if (/^\d+:\d+$/.test(s)) {
    const [m, sec] = s.split(':').map(Number)
    return m * 60 + sec
  }
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Split the agno markdown review into discrete sections so we can render each
 * in its own card. Sections: Strengths, Specific Drills, Timestamped Notes.
 * (Older sessions without Timestamped Notes still parse cleanly.)
 */
function parseReview(md) {
  const sections = { strengths: [], drills: [], timeline: [] }
  if (!md) return sections
  const lines = md.split('\n')
  let current = null

  for (const raw of lines) {
    const heading = raw.match(/^#+\s*(.+)/)
    if (heading) {
      const t = heading[1].toLowerCase()
      if (t.includes('strength')) current = 'strengths'
      else if (t.includes('drill')) current = 'drills'
      else if (t.includes('timestamp') || t.includes('timeline') || t.includes('note'))
        current = 'timeline'
      else current = null
      continue
    }

    if (current === 'timeline') {
      // Range: "0:23-0:35: hands went into pockets"
      let m = raw.match(/^\s*(\d+:\d+|\d+)\s*[-–]\s*(\d+:\d+|\d+)\s*[:\-]\s*(.+)/)
      if (m) {
        const start = tsToSeconds(m[1])
        const end = tsToSeconds(m[2])
        const text = m[3].trim()
        if (start !== null && end !== null && text) {
          sections.timeline.push({ start, end: Math.max(end, start), text })
          continue
        }
      }
      // Point in time: "0:05: eye contact dropped"
      m = raw.match(/^\s*(\d+:\d+|\d+)\s*[:\-]\s*(.+)/)
      if (m) {
        const t = tsToSeconds(m[1])
        const text = m[2].trim()
        if (t !== null && text) sections.timeline.push({ start: t, end: t, text })
      }
      continue
    }

    const bullet = raw.match(/^[-*]\s+(.+)/)
    if (bullet && current) sections[current].push(bullet[1].trim())
  }
  return sections
}

function formatTs(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function ReviewCard({ kind, title, accent, items }) {
  if (!items || items.length === 0) return null
  return (
    <motion.section
      className="neu review-section-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 * kind }}
    >
      <header className="review-section-head">
        <span className="dot" style={{ background: accent }} />
        <h3>{title}</h3>
        <span className="count">{items.length}</span>
      </header>
      <ul>
        {items.map((it, i) => (
          <li key={i}>{renderInline(it)}</li>
        ))}
      </ul>
    </motion.section>
  )
}

/**
 * Horizontal timeline that mirrors the video duration. Red markers at each
 * timestamped recommendation. Hover shows the recommendation; click seeks
 * the video to that moment.
 */
function Timeline({ duration, markers, currentTime, onSeek }) {
  if (!Number.isFinite(duration) || duration <= 0 || markers.length === 0) return null
  return (
    <div className="timeline">
      <div className="timeline-header">
        <span className="timeline-label">Timeline of recommendations</span>
        <span className="timeline-duration">{formatTs(duration)}</span>
      </div>
      <div className="timeline-track">
        <div
          className="timeline-progress"
          style={{ width: `${Math.min(100, (currentTime / duration) * 100)}%` }}
        />
        {markers.map((m, i) => {
          const left = Math.min(100, (m.start / duration) * 100)
          const width = m.end > m.start
            ? Math.max(1, ((m.end - m.start) / duration) * 100)
            : 0.6
          return (
            <div
              key={i}
              className={`timeline-marker ${m.end > m.start ? 'is-range' : 'is-point'}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              onClick={() => onSeek(m.start)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSeek(m.start)
                }
              }}
              aria-label={`Recommendation at ${formatTs(m.start)}`}
            >
              <span className="timeline-tip">
                <span className="timeline-tip-time">{formatTs(m.start)}</span>
                <span className="timeline-tip-text">{m.text}</span>
              </span>
            </div>
          )
        })}
      </div>
      <div className="timeline-foot">
        <span>0:00</span>
        <span className="muted">Click any red marker to jump to that moment</span>
        <span>{formatTs(duration)}</span>
      </div>
    </div>
  )
}

export default function History() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [videoUrl, setVideoUrl] = useState(null)
  const [videoLoading, setVideoLoading] = useState(true)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const videoRef = useRef(null)
  const probingDuration = useRef(false)

  // Editable name state.
  const [name, setName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameDirty, setNameDirty] = useState(false)
  const lastSavedName = useRef('')

  // Re-review state.
  const [reReviewing, setReReviewing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSession(null)
    setError(null)
    setNameDirty(false)
    api.getSession(id)
      .then((s) => {
        if (cancelled) return
        setSession(s)
        setName(s.name || '')
        lastSavedName.current = s.name || ''
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    let cancelled = false
    let createdUrl = null
    const controller = new AbortController()
    probingDuration.current = false
    setVideoUrl(null)
    setDuration(0)
    setCurrentTime(0)
    setVideoLoading(true)
    async function load() {
      try {
        const token = getToken()
        const res = await fetch(api.videoUrl(id), {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) throw new Error(`Video fetch failed (${res.status})`)
        const blob = await res.blob()
        if (cancelled) return
        createdUrl = URL.createObjectURL(blob)
        setVideoUrl(createdUrl)
      } catch (e) {
        if (!cancelled) setError((prev) => prev || e.message)
      } finally {
        if (!cancelled) setVideoLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
      controller.abort()
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [id])

  async function handleDelete() {
    if (!confirm('Delete this practice session? This cannot be undone.')) return
    setDeleting(true)
    try {
      await api.deleteSession(id)
      navigate('/dashboard')
    } catch (e) {
      setError(e.message)
      setDeleting(false)
    }
  }

  async function saveName() {
    if (!nameDirty || nameSaving) return
    const trimmed = name.trim().slice(0, 80)
    if (trimmed === lastSavedName.current) {
      setNameDirty(false)
      return
    }
    setNameSaving(true)
    try {
      const updated = await api.updateSession(id, { name: trimmed })
      setSession((prev) => ({ ...prev, name: updated.name || '' }))
      setName(updated.name || '')
      lastSavedName.current = updated.name || ''
      setNameDirty(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setNameSaving(false)
    }
  }

  function seekTo(seconds) {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(seconds, v.duration || seconds))
    v.play().catch(() => {})
  }

  async function handleReReview() {
    if (reReviewing) return
    setReReviewing(true)
    setError(null)
    try {
      const updated = await api.reReviewSession(id)
      setSession((prev) => ({ ...prev, review: updated.review }))
    } catch (e) {
      setError(e.message || 'Re-review failed')
    } finally {
      setReReviewing(false)
    }
  }

  if (error && !session) return <p className="error">{error}</p>
  if (!session) return <p className="muted">Loading…</p>

  const parsed = parseReview(session.review)
  const displayName = name.trim() || 'Untitled session'

  return (
    <div className="history-layout stack">
      {error && <p className="error" role="alert">{error}</p>}
      <div className="history-head">
        <Link to="/dashboard" className="back-link">← Back to dashboard</Link>
        <h1 className="page-title" style={{ margin: 0 }}>{displayName}</h1>
        <p className="muted" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', marginTop: 4 }}>
          {new Date(session.created_at).toLocaleString()}
        </p>
      </div>

      <motion.div
        className="video-frame"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {videoLoading && <div className="video-loading">Loading video…</div>}
        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            onLoadedMetadata={(e) => {
              const video = e.currentTarget
              if (Number.isFinite(video.duration)) setDuration(video.duration)
              else {
                probingDuration.current = true
                video.currentTime = 1e10
              }
            }}
            onDurationChange={(e) => {
              const video = e.currentTarget
              if (Number.isFinite(video.duration)) {
                setDuration(video.duration)
              }
            }}
            onSeeked={(e) => {
              if (probingDuration.current) {
                probingDuration.current = false
                e.currentTarget.currentTime = 0
              }
            }}
            onTimeUpdate={(e) => { if (!probingDuration.current) setCurrentTime(e.currentTarget.currentTime || 0) }}
          />
        )}
      </motion.div>

      <Timeline
        duration={duration}
        markers={parsed.timeline}
        currentTime={currentTime}
        onSeek={seekTo}
      />

      {parsed.timeline.length === 0 && (
        <div className="timeline-empty">
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            No timestamped notes in this review. The original feedback is in the cards below.
            Hit <strong style={{ color: 'var(--neon-cyan)' }}>Re-review</strong> below to ask the coach
            for a timestamped breakdown of this take.
          </p>
        </div>
      )}

      {!parsed.strengths.length && !parsed.drills.length && !parsed.timeline.length && (
        <p className="neu" style={{ padding: 'var(--gap-4)', whiteSpace: 'pre-wrap' }}>
          {session.review || 'No review available. Use Re-review to try again.'}
        </p>
      )}
      {/* Strengths + Specific Drills as cards */}
      <div className="review-grid">
        <ReviewCard
          kind={0}
          title="Strengths"
          accent="var(--success)"
          items={parsed.strengths}
        />
        <ReviewCard
          kind={1}
          title="Specific Drills"
          accent="var(--neon-cyan)"
          items={parsed.drills}
        />
      </div>

      {session.ideation && (
        <motion.section
          className="neu"
          style={{ padding: 'var(--gap-4)' }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <h2 className="section-title">Reference ideation</h2>
          <p className="muted" style={{ marginBottom: 'var(--gap-3)', fontSize: '0.9rem' }}>
            {session.ideation.prompt}
          </p>
          <IdeationItem items={session.ideation.items} />
        </motion.section>
      )}

      <motion.section
        className="neu session-actions"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <div className="session-actions-head">
          <h2 className="section-title">Session actions</h2>
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: 2 }}>
            Rename or remove this take.
          </p>
        </div>

        <div className="rename-row">
          <div className="field" style={{ flex: 1 }}>
            <label className="field-label" htmlFor="rename-input">Session name</label>
            <input
              id="rename-input"
              className="input"
              type="text"
              maxLength={80}
              value={name}
              disabled={nameSaving}
              onChange={(e) => {
                setName(e.target.value)
                setNameDirty(e.target.value !== lastSavedName.current)
              }}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              placeholder="Untitled session"
            />
            <span className="rename-status">
              {nameSaving && <span className="muted">saving…</span>}
              {!nameSaving && nameDirty && (
                <span style={{ color: 'var(--neon-cyan)' }}>
                  unsaved — press Enter or click away to save
                </span>
              )}
              {!nameSaving && !nameDirty && name.trim() && (
                <span className="muted">saved</span>
              )}
            </span>
          </div>
          <button
            type="button"
            className="btn"
            onClick={saveName}
            disabled={!nameDirty || nameSaving}
          >
            Save name
          </button>
        </div>

        <div className="delete-row">
          <div>
            <h3 className="section-title" style={{ marginBottom: 4 }}>Delete this session</h3>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              The recording, thumbnail, and coach review will be removed permanently.
            </p>
          </div>
          <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete session'}
          </button>
        </div>

        <div className="rereview-row">
          <div>
            <h3 className="section-title" style={{ marginBottom: 4 }}>Re-run coach review</h3>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Useful when you want a fresh take on the same recording, or to upgrade an older
              review to the timestamped format.
            </p>
          </div>
          <button
            className="btn"
            onClick={handleReReview}
            disabled={reReviewing}
          >
            {reReviewing ? 'Re-reviewing…' : 'Re-review'}
          </button>
        </div>
      </motion.section>
    </div>
  )
}