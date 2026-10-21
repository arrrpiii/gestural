import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import AlbumCard from '../components/AlbumCard.jsx'

export default function Dashboard() {
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.albums.list().then((items) => { if (!cancelled) setAlbums(items) })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reload])
  async function create(event) {
    event.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const album = await api.albums.create(name.trim())
      setAlbums((previous) => [album, ...previous])
      setName('')
    } catch (e) { setCreateError(e.message) }
    finally { setCreating(false) }
  }
  return (
    <div className="stack page-stack">
      <div className="page-head">
        <div><h1>Albums</h1><p>Group your recordings and track your progress.</p></div>
        <Link to="/record" className="btn btn-primary">Record a take</Link>
      </div>
      <form className="album-create" onSubmit={create}>
        <label className="field" htmlFor="album-name"><span className="field-label">New album</span>
          <input id="album-name" className="input" aria-label="New album name" placeholder="e.g. Investor pitch" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} disabled={creating || loading} />
        </label>
        <button className="btn" disabled={!name.trim() || creating || loading}>{creating ? 'Creating…' : 'Create album'}</button>
      </form>
      {createError && <p className="error" role="alert">{createError}</p>}
      {loading ? <p role="status" className="muted">Loading</p> : error ? (
        <div className="empty"><p className="error" role="alert">{error}</p><button className="btn" onClick={() => setReload((value) => value + 1)}>Try again</button></div>
      ) : albums.length === 0 ? (
        <div className="empty"><h2>No albums yet.</h2><p>Create an album above to save your first recording.</p></div>
      ) : <div className="albums-grid">{albums.map((album) => <AlbumCard key={album.id} album={album} />)}</div>}
    </div>
  )
}
