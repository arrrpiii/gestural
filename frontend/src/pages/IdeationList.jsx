import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import IdeationItem from '../components/IdeationItem.jsx'

export default function IdeationList() {
  const [search, setSearch] = useSearchParams()
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reload, setReload] = useState(0)
  const selected = items?.find((item) => item.id === search.get('script'))
  useEffect(() => {
    let cancelled = false
    setError(null)
    api.listIdeations().then((result) => { if (!cancelled) setItems(result) })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [reload])
  async function generate(event) {
    event.preventDefault()
    if (prompt.trim().length < 3 || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.createIdeation(prompt.trim())
      setItems((previous) => [result, ...(previous || [])])
      setSearch({ script: result.id })
      setPrompt('')
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function remove() {
    if (deleting || !window.confirm('Delete this script?')) return
    setDeleting(true)
    setError(null)
    try {
      await api.deleteIdeation(selected.id)
      setItems((previous) => previous.filter((item) => item.id !== selected.id))
      setSearch({})
    } catch (e) { setError(e.message) }
    finally { setDeleting(false) }
  }
  return (
    <div className="stack page-stack">
      <div className="page-head"><div><h1>Scripts</h1><p>Plan what to say and how to deliver it.</p></div></div>
      <div className="scripts-layout">
        <aside className="scripts-sidebar">
          <button className={`btn ${!selected ? 'btn-primary' : ''}`} onClick={() => setSearch({})}>New script</button>
          <h2>Saved scripts</h2>
          {items === null ? (error ? <button className="btn" onClick={() => setReload((value) => value + 1)}>Retry loading</button> : <p role="status">Loading</p>) : !items.length ? <p className="muted">Your scripts will appear here.</p> : (
            <nav className="script-list" aria-label="Saved scripts">{items.map((item) => (
              <Link key={item.id} to={`/scripts?script=${item.id}`} className={selected?.id === item.id ? 'selected' : ''} aria-current={selected?.id === item.id ? 'page' : undefined}>
                <span>{item.prompt}</span><small>{new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
              </Link>
            ))}</nav>
          )}
        </aside>
        <section className="script-editor" aria-label={selected ? 'Script details' : 'Create script'}>
          {error && <p role="alert" className="error">{error}</p>}
          {selected ? <>
            <div className="script-heading"><h2>{selected.prompt}</h2><Link className="btn btn-primary" to={`/record?script=${selected.id}`}>Use for recording</Link></div>
            <IdeationItem items={selected.items} />
            <button className="btn btn-ghost" onClick={remove} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete script'}</button>
          </> : <form className="stack" onSubmit={generate}>
            <label htmlFor="script-topic" className="field-label">What are you working on?</label>
            <textarea id="script-topic" className="textarea" placeholder="e.g. A short pitch for a productivity app for college students" rows={5} maxLength={2000} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={busy} required minLength={3} />
            <div className="form-foot"><p>A short script with a delivery cue for each line.</p><button className="btn btn-primary" disabled={busy || items === null || prompt.trim().length < 3}>{busy ? 'Writing script…' : 'Generate script'}</button></div>
            {busy && <p role="status" className="muted">Preparing your script…</p>}
          </form>}
        </section>
      </div>
    </div>
  )
}
