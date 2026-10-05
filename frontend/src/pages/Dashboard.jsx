import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '../api.js'
import IdeationItem from '../components/IdeationItem.jsx'
import SessionCard from '../components/SessionCard.jsx'
import AlbumCard from '../components/AlbumCard.jsx'

const MAX_ALBUM_NAME = 80

export default function Dashboard() {
  const [prompt, setPrompt] = useState('')
  const [ideation, setIdeation] = useState(null) // {items, prompt}
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [albums, setAlbums] = useState([])
  const [newAlbumName, setNewAlbumName] = useState('')
  const [creatingAlbum, setCreatingAlbum] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [openAlbumId, setOpenAlbumId] = useState(null)
  // Sessions for the open album modal.
  const [albumSessions, setAlbumSessions] = useState(null)
  const [albumSessionsError, setAlbumSessionsError] = useState(null)
  // Rename state for the open album.
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState(null)
  const [renamingBusy, setRenamingBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [modalError, setModalError] = useState(null)

  useEffect(() => {
    api.albums.list().then(setAlbums).catch((e) => setCreateError(e.message))
  }, [])

  // Load the open album's sessions whenever it changes.
  useEffect(() => {
    if (!openAlbumId) {
      setAlbumSessions(null)
      setAlbumSessionsError(null)
      setRenaming(false)
      setModalError(null)
      return
    }
    let cancelled = false
    setRenaming(false)
    setAlbumSessions(null)
    setAlbumSessionsError(null)
    setModalError(null)
    api
      .listSessions()
      .then((all) => {
        if (!cancelled) setAlbumSessions(all.filter((s) => s.album_id === openAlbumId))
      })
      .catch((e) => { if (!cancelled) setAlbumSessionsError(e.message) })
    return () => { cancelled = true }
  }, [openAlbumId])

  // Close the album modal on Escape.
  useEffect(() => {
    if (!openAlbumId) return
    function onKey(e) {
      if (e.key === 'Escape') setOpenAlbumId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openAlbumId])

  async function refreshAlbums() {
    try {
      setAlbums(await api.albums.list())
    } catch {
      // Non-fatal — leave the list as-is.
    }
  }

  async function generate() {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.createIdeation(prompt.trim())
      setIdeation({ items: result.items, prompt: result.prompt })
      setPrompt('')
    } catch (e) {
      setError(e.message || 'Could not generate ideas. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function restart() {
    setIdeation(null)
    setPrompt('')
    setError(null)
  }

  async function handleCreateAlbum() {
    const name = newAlbumName.trim()
    if (!name || creatingAlbum) return
    setCreatingAlbum(true)
    setCreateError(null)
    try {
      const created = await api.albums.create(name)
      setAlbums((prev) => [created, ...prev])
      setNewAlbumName('')
    } catch (e) {
      setCreateError(e.message || 'Could not create album.')
    } finally {
      setCreatingAlbum(false)
    }
  }

  function startRename() {
    const open = openAlbum()
    if (!open) return
    setRenameValue(open.name)
    setRenameError(null)
    setRenaming(true)
  }

  function cancelRename() {
    setRenaming(false)
    setRenameValue('')
    setRenameError(null)
  }

  async function commitRename() {
    const open = openAlbum()
    if (!open) return
    const name = renameValue.trim()
    if (!name) {
      setRenameError('Name is required')
      return
    }
    setRenamingBusy(true)
    setRenameError(null)
    try {
      const updated = await api.albums.rename(open.id, name)
      setAlbums((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      setRenaming(false)
    } catch (e) {
      setRenameError(e.message)
    } finally {
      setRenamingBusy(false)
    }
  }

  async function handleDeleteAlbum() {
    const open = openAlbum()
    if (!open || deleting) return
    const n = open.session_count ?? 0
    const ok = window.confirm(
      `Delete album "${open.name}"?${
        n ? ` This will remove ${n} recording${n === 1 ? '' : 's'} and ${n === 1 ? 'its' : 'their'} AI feedback.` : ''
      }`,
    )
    if (!ok) return
    setDeleting(true)
    setModalError(null)
    try {
      await api.albums.delete(open.id)
      setAlbums((prev) => prev.filter((a) => a.id !== open.id))
      setOpenAlbumId(null)
    } catch (e) {
      setModalError(e.message)
    } finally {
      setDeleting(false)
    }
  }

  const openAlbum = () =>
    openAlbumId ? albums.find((a) => a.id === openAlbumId) : null

  return (
    <div className="stack" style={{ gap: 'var(--gap-5)' }}>
      <h1 className="page-title">Dashboard</h1>

      {/* 1. Ideation ------------------------------------------------- */}
      <motion.section
        className="neu"
        style={{ padding: 'var(--gap-4)' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="section-title">Idea recommendations</h2>
        <p className="muted" style={{ marginBottom: 'var(--gap-3)', fontSize: '0.9rem' }}>
          Describe your topic. You'll get a short script with paired gestures.
        </p>

        {!ideation ? (
          <div className="ideation-prompt">
            <textarea
              className="textarea"
              placeholder="e.g. A 30-second pitch for a productivity app that targets college students"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              maxLength={2000}
              aria-label="Topic for your script"
              disabled={loading}
            />
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={generate} disabled={prompt.trim().length < 3 || loading}>
                {loading ? 'Generating…' : 'Generate ideas'}
              </button>
              {error && <p className="error" style={{ marginLeft: 8 }}>{error}</p>}
            </div>
          </div>
        ) : (
          <>
            <IdeationItem items={ideation.items} />
            <div className="row" style={{ marginTop: 'var(--gap-3)' }}>
              <button className="btn" onClick={restart}>Restart session</button>
              <a
                className="btn btn-ghost"
                href={`/ideation`}
                onClick={(e) => e.stopPropagation()}
              >
                View all ideations
              </a>
            </div>
          </>
        )}
      </motion.section>

      {/* 2. Create album -------------------------------------------- */}
      <motion.section
        className="neu"
        style={{ padding: 'var(--gap-4)' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <h2 className="section-title">Create album</h2>
        <p className="muted" style={{ marginBottom: 'var(--gap-3)', fontSize: '0.9rem' }}>
          Group your takes for the same pitch under one album. Sessions are stored inside the album you pick.
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input
            className="input"
            type="text"
            maxLength={MAX_ALBUM_NAME}
            aria-label="New album name"
            placeholder="e.g. Q3 investor pitch"
            value={newAlbumName}
            onChange={(e) => setNewAlbumName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateAlbum()
            }}
            disabled={creatingAlbum}
            style={{ flex: '1 1 240px', minWidth: '240px' }}
          />
          <button
            className="btn btn-primary"
            onClick={handleCreateAlbum}
            disabled={!newAlbumName.trim() || creatingAlbum}
          >
            {creatingAlbum ? 'Creating…' : 'Create album'}
          </button>
        </div>
        {createError && <p className="error" style={{ marginTop: 'var(--gap-2)' }}>{createError}</p>}
      </motion.section>

      {/* 3. Albums -------------------------------------------------- */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <h2 className="section-title">Your albums</h2>
        {albums.length === 0 ? (
          <div className="empty">
            No albums yet. Create one above, then hit the <span style={{ color: 'var(--neon-cyan)' }}>+</span> button to start recording.
          </div>
        ) : (
          <div className="albums-grid">
            {albums.map((a) => (
              <AlbumCard key={a.id} album={a} onOpen={(al) => setOpenAlbumId(al.id)} />
            ))}
          </div>
        )}
      </motion.section>

      {/* Album-detail modal ---------------------------------------- */}
      <AnimatePresence>
        {openAlbum() && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpenAlbumId(null)}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              className="modal-panel neu"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-head">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="modal-eyebrow">Album</span>
                  {renaming ? (
                    <div className="field" style={{ marginTop: 'var(--gap-2)' }}>
                      <input
                        className="input"
                        type="text"
                        maxLength={MAX_ALBUM_NAME}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename()
                          if (e.key === 'Escape') cancelRename()
                        }}
                        autoFocus
                        disabled={renamingBusy}
                      />
                      {renameError && (
                        <p className="error" style={{ marginTop: 6 }}>{renameError}</p>
                      )}
                    </div>
                  ) : (
                    <h2 className="modal-title">{openAlbum().name}</h2>
                  )}
                  <span className="modal-date">
                    {new Date(openAlbum().created_at).toLocaleString()} ·{' '}
                    {openAlbum().session_count} take
                    {openAlbum().session_count === 1 ? '' : 's'}
                  </span>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setOpenAlbumId(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                {modalError && <p className="error">{modalError}</p>}
                {albumSessionsError && <p className="error">{albumSessionsError}</p>}
                {!albumSessionsError && albumSessions === null && (
                  <p className="muted">Loading…</p>
                )}
                {!albumSessionsError && albumSessions && albumSessions.length === 0 && (
                  <div className="empty">
                    No takes yet. Hit the <span style={{ color: 'var(--neon-cyan)' }}>+</span> button and pick this album to record one.
                  </div>
                )}
                {!albumSessionsError && albumSessions && albumSessions.length > 0 && (
                  <div className="album-sessions-grid">
                    {albumSessions.map((s) => (
                      <SessionCard key={s.id} session={s} />
                    ))}
                  </div>
                )}
              </div>

              <div className="modal-foot">
                {renaming ? (
                  <>
                    <button
                      type="button"
                      className="btn"
                      onClick={cancelRename}
                      disabled={renamingBusy}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={commitRename}
                      disabled={renamingBusy || !renameValue.trim()}
                    >
                      {renamingBusy ? 'Saving…' : 'Save name'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn"
                      onClick={startRename}
                      disabled={deleting}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={handleDeleteAlbum}
                      disabled={deleting}
                    >
                      {deleting ? 'Deleting…' : 'Delete album'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setOpenAlbumId(null)}
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
