import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'

const DIMENSIONS = {
  clarity: 'Clarity', pacing: 'Pacing', vocal_delivery: 'Vocal delivery',
  gestures: 'Gestures', posture: 'Posture', eye_contact: 'Eye contact',
}
const TRENDS = {
  improved: 'Improved', regressed: 'Needs attention', unchanged: 'Unchanged',
  mixed: 'Mixed progress', insufficient_evidence: 'Not enough evidence',
}

export default function PerformanceReview({ albumId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const mounted = useRef(false)

  useEffect(() => {
    let cancelled = false
    mounted.current = true
    setLoading(true)
    setError(null)
    api.albums.performance(albumId)
      .then((result) => { if (!cancelled) setData(result) })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true; mounted.current = false }
  }, [albumId, reload])

  async function review() {
    if (reviewing) return
    setReviewing(true)
    setError(null)
    try {
      const result = await api.albums.reviewPerformance(albumId)
      if (mounted.current) setData(result)
    } catch (e) {
      if (mounted.current) setError(e.message)
    } finally {
      if (mounted.current) setReviewing(false)
    }
  }

  const report = data?.report
  const recordings = report?.recordings || []
  const byId = Object.fromEntries(recordings.map((recording, index) => [recording.id, { ...recording, number: index + 1 }]))
  const improved = report?.dimensions.filter((item) => item.trend === 'improved').length || 0
  const attention = report?.dimensions.filter((item) => item.trend === 'regressed' || item.trend === 'mixed').length || 0

  return (
    <section className="performance-review" aria-label="Performance review">
      <div className="performance-heading">
        <div>
          <h3>Performance review</h3>
        </div>
        {!loading && !report && data && (
          <button className="btn btn-primary" onClick={review} disabled={reviewing || data.reviewed_count < 2}>
            {reviewing ? 'Comparing…' : data.stale ? 'Update performance review' : 'Review progress'}
          </button>
        )}
      </div>
      <p className="muted performance-description">
        Compare up to six recent takes using saved coaching feedback.
      </p>
      {loading && <p role="status">Loading performance review…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!loading && !data && error && (
        <button className="btn" onClick={() => setReload((value) => value + 1)}>Retry loading review</button>
      )}
      {!loading && data && !report && (
        <div className="performance-empty">
          {data.reviewed_count < 2 ? (
            <p>Add at least two recordings with coaching reviews to compare your progress. Re-review any takes whose feedback failed.</p>
          ) : (
            <p>{data.stale ? 'Your recordings or feedback have changed. Update the comparison to see your current progress.' :
              `Compare ${data.reviewed_count} reviewed recordings to see what improved and what to practice next.`}</p>
          )}
          {data.recording_count > data.reviewed_count && (
            <p className="muted">{data.recording_count - data.reviewed_count} take(s) without usable feedback will be excluded.</p>
          )}
        </div>
      )}
      {reviewing && <p role="status">Comparing recordings and checking supporting evidence…</p>}
      {report && (
        <>
          <p className="performance-summary">{report.summary}</p>
          <div className="performance-stats">
            <span><strong>{recordings.length}</strong> recordings compared</span>
            <span><strong>{improved}</strong> areas improved</span>
            <span><strong>{attention}</strong> areas to focus on</span>
          </div>
          <p className="muted performance-description">
            Baseline: {recordings[0]?.name} · Latest: {recordings.at(-1)?.name}.
            {' '}Generated {new Date(report.generated_at).toLocaleString()}.
            {report.excluded_count > 0 && ` ${report.excluded_count} take(s) excluded because feedback was unavailable.`}
          </p>
          <ol className="performance-recordings" aria-label="Recordings compared, oldest first">
            {recordings.map((recording, index) => (
              <li key={recording.id}>
                <Link to={`/history/${recording.id}`}>Take {index + 1}: {recording.name}</Link>
                <span className="muted">{recording.created_at ? new Date(recording.created_at).toLocaleString() : 'Date unavailable'}</span>
              </li>
            ))}
          </ol>
          <div className="performance-dimensions">
            {report.dimensions.map((item) => (
              <article className="performance-dimension" key={item.dimension}>
                <div className="performance-heading">
                  <h4>{DIMENSIONS[item.dimension]}</h4>
                  <span className={`performance-trend trend-${item.trend}`}>{TRENDS[item.trend]}</span>
                </div>
                <div className="performance-comparison">
                  <div><span className="performance-label">Baseline take</span><p>{item.baseline}</p></div>
                  <div><span className="performance-label">Latest take</span><p>{item.latest}</p></div>
                </div>
                <p className="performance-explanation">{item.explanation}</p>
                <p className="performance-next"><strong>Next practice:</strong> {item.next_step}</p>
                {item.evidence.length > 0 && (
                  <details className="performance-evidence">
                    <summary>Supporting feedback ({item.evidence.length})</summary>
                    {item.evidence.map((evidence, index) => (
                      <blockquote key={`${evidence.session_id}-${index}`}>
                        <p>“{evidence.quote}”</p>
                        <Link to={`/history/${evidence.session_id}`}>
                          Take {byId[evidence.session_id]?.number}: {byId[evidence.session_id]?.name}
                        </Link>
                      </blockquote>
                    ))}
                  </details>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
