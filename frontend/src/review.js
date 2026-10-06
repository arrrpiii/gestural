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
 * Split the AI markdown review into discrete sections so we can render each
 * in its own card. Sections: Strengths, Specific Drills, Timestamped Notes.
 * (Older sessions without Timestamped Notes still parse cleanly.)
 */
export function parseReview(md) {
  const sections = { strengths: [], drills: [], timeline: [] }
  if (!md) return sections
  const lines = md.split('\n')
  let current = null

  for (const raw of lines) {
    const clean = raw.trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, '').replace(/[*`]/g, '')
    const heading = clean.match(/^#+\s*(.+)/) || clean.match(/^(Strengths|Specific Drills|Timestamped Notes|Timeline|Notes):?$/i)
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
      let m = clean.replace(/[\[\]]/g, '').match(/^\s*(\d+:[0-5]\d|\d+)\s*[-–—]\s*(\d+:[0-5]\d|\d+)\s*[:\-–—]\s*(.+)/)
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
      m = clean.replace(/[\[\]]/g, '').match(/^\s*(\d+:[0-5]\d|\d+)\s*[:\-–—]\s*(.+)/)
      if (m) {
        const t = tsToSeconds(m[1])
        const text = m[2].trim()
        if (t !== null && text) sections.timeline.push({ start: t, end: t, text })
      }
      continue
    }

    const bullet = raw.trim().match(/^(?:[-*•]|\d+[.)])\s+(.+)/)
    if (bullet && current) sections[current].push(bullet[1].trim())
  }
  return sections
}

