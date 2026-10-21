import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import SessionCard from '../components/SessionCard.jsx'
import PerformanceReview from '../components/PerformanceReview.jsx'

export default function Album() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [album, setAlbum] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([api.albums.list(), api.listSessions()]).then(([albums, takes]) => {
      if (cancelled) return
      const found = albums.find((item) => item.id === id)
      if (!found) throw new Error('Album not found.')
      setAlbum(found)
      setName(found.name)
      setSessions(takes.filter((take) => take.album_id === id))
    }).catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, reload])
  async function rename(event) {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try { setAlbum(await api.albums.rename(id, name.trim())); setEditing(false) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function remove() {
    if (busy || !window.confirm(`Delete album "${album.name}" and all its recordings? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    try { await api.albums.delete(id); navigate('/albums') }
    catch (e) { setError(e.message); setBusy(false) }
  }
  if (loading) return <p role="status">Loading</p>
  if (!album) return <div className="stack"><p role="alert" className="error">{error}</p><button className="btn" onClick={() => setReload((value) => value + 1)}>Try again</button><Link to="/albums">Back to albums</Link></div>
  return (
    <div className="stack page-stack">
      <Link to="/albums" className="back-link">← Albums</Link>
      <div className="page-head">
        <div><h1>{album.name}</h1><p>{sessions.length} recording{sessions.length === 1 ? '' : 's'}</p></div>
        <Link to={`/record?album=${id}`} className="btn btn-primary">Record a take</Link>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {sessions.length ? <div className="sessions-grid">{sessions.map((session) => <SessionCard key={session.id} session={session} />)}</div> : <div className="empty"><h2>No recordings yet.</h2><p>Record your first take in this album.</p></div>}
      <PerformanceReview key={id} albumId={id} />
      <details className="album-settings"><summary>Album settings</summary>
        {editing ? <form className="rename-row" onSubmit={rename}>
          <label className="field"><span className="field-label">Album name</span><input className="input" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save name'}</button>
          <button type="button" className="btn" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
        </form> : <div className="row"><button className="btn" onClick={() => setEditing(true)} disabled={busy}>Rename album</button><button className="btn btn-danger" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete album'}</button></div>}
      </details>
    </div>
  )
}
