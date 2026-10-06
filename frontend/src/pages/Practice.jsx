import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api } from '../api.js'

const MAX_SECONDS = 120

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function Practice() {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const mountedRef = useRef(false)
  const cameraRequestRef = useRef(0)

  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [ideations, setIdeations] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [selected, setSelected] = useState(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraLoading, setCameraLoading] = useState(true)
  const [sessionName, setSessionName] = useState('')
  const [albums, setAlbums] = useState([])
  const [selectedAlbumId, setSelectedAlbumId] = useState('')

  // Load ideations for the dropdown.
  useEffect(() => {
    api.listIdeations().then(setIdeations).catch((e) => setError(e.message))
  }, [])

  // Load albums for the required album picker.
  useEffect(() => {
    api.albums.list().then(setAlbums).catch((e) => setError(e.message))
  }, [])

  async function enableCamera() {
    const request = ++cameraRequestRef.current
    setCameraLoading(true)
    setError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error('Recording requires a supported browser and HTTPS (or localhost).')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      if (!mountedRef.current || request !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      if (mountedRef.current && request === cameraRequestRef.current) setCameraReady(true)
    } catch (e) {
      if (mountedRef.current && request === cameraRequestRef.current) {
        setError(e.message || 'Could not access the camera or microphone.')
      }
    } finally {
      if (mountedRef.current && request === cameraRequestRef.current) setCameraLoading(false)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    enableCamera()
    return () => {
      mountedRef.current = false
      ++cameraRequestRef.current
      const recorder = recorderRef.current
      if (recorder) {
        recorder.onstop = null
        recorder.ondataavailable = null
        recorder.onerror = null
        if (recorder.state !== 'inactive') recorder.stop()
      }
      stopStream()
    }
  }, [])

  // Recording timer.
  useEffect(() => {
    if (!recording) return
    const startedAt = Date.now()
    const id = setInterval(() => setElapsed(Math.min(MAX_SECONDS, Math.floor((Date.now() - startedAt) / 1000))), 250)
    const timeout = setTimeout(stopRecording, MAX_SECONDS * 1000)
    return () => { clearInterval(id); clearTimeout(timeout) }
  }, [recording])

  // Load selected ideation's items.
  useEffect(() => {
    if (!selectedId) {
      setSelected(null)
      return
    }
    let cancelled = false
    setSelected(null)
    api.getIdeation(selectedId)
      .then((item) => { if (!cancelled) setSelected(item) })
      .catch(() => { if (!cancelled) setSelected(null) })
    return () => { cancelled = true }
  }, [selectedId])

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    if (mountedRef.current) setCameraReady(false)
  }

  function startRecording() {
    if (!streamRef.current || recording || uploading) return
    if (!selectedAlbumId) {
      setError('Pick an album before recording.')
      return
    }
    setError(null)
    chunksRef.current = []
    try {
      // Prefer codecs that include Opus audio so Gemini can hear the take.
      const mimeCandidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ]
      const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || ''
      const recorder = mime
        ? new MediaRecorder(streamRef.current, { mimeType: mime })
        : new MediaRecorder(streamRef.current)
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onerror = () => {
        recorder.onstop = null
        stopStream()
        setUploading(false)
        setRecording(false)
        setError('Recording failed. Please try again.')
      }
      recorder.onstop = () => {
        stopStream()
        if (mountedRef.current) uploadRecording(recorder.mimeType)
      }
      recorder.start()
      recorderRef.current = recorder
      setElapsed(0)
      setRecording(true)
    } catch {
      setError('Could not start recording. Please try another browser.')
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      setUploading(true)
      recorderRef.current.stop()
    }
    stopStream()
    setRecording(false)
  }

  async function uploadRecording(mimeType) {
    setRecording(false)
    const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
    chunksRef.current = []
    if (blob.size === 0) {
      setUploading(false)
      setError('No video captured.')
      return
    }
    if (blob.size > 50 * 1024 * 1024) {
      setUploading(false)
      setError('Recording exceeds 50 MB. Please record a shorter take.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('video', blob, blob.type.includes('mp4') ? 'recording.mp4' : 'recording.webm')
      form.append('album_id', selectedAlbumId)
      if (selectedId) form.append('ideation_id', selectedId)
      if (sessionName.trim()) form.append('name', sessionName.trim())
      const session = await api.uploadSession(form)
      if (mountedRef.current) navigate(`/history/${session.id}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="practice-layout">
      <h1 className="page-title">Practice</h1>

      {/* Top: name + album + ideation dropdown, full width */}
      <div className="practice-top">
        <div className="field">
          <label className="field-label" htmlFor="session-name">
            Name this session (optional)
          </label>
          <input
            id="session-name"
            className="input"
            type="text"
            maxLength={80}
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="e.g. Pitch take #3"
            disabled={recording || uploading}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="album-select">
            Album *
          </label>
          <select
            id="album-select"
            className="select"
            value={selectedAlbumId}
            onChange={(e) => setSelectedAlbumId(e.target.value)}
            disabled={recording || uploading}
            required
          >
            <option value="">
              {albums.length === 0
                ? '— Create an album on the dashboard first —'
                : '— Pick an album —'}
            </option>
            {albums.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.session_count ? `  (${a.session_count} take${a.session_count === 1 ? '' : 's'})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="ideation-select">
            Reference an ideation (optional)
          </label>
          <select
            id="ideation-select"
            className="select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={recording || uploading}
          >
            <option value="">— None —</option>
            {ideations.map((i) => (
              <option key={i.id} value={i.id}>
                {i.prompt.length > 60 ? i.prompt.slice(0, 60) + '…' : i.prompt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Middle: equal-height columns — camera + script reference */}
      <div className="practice-grid">
        <div className="practice-col practice-col-camera">
          <div className="webcam-frame">
            <video ref={videoRef} muted playsInline />
            {!cameraReady && (
              <div className="placeholder">
                {cameraLoading ? 'Requesting camera…' : 'Camera off'}
              </div>
            )}
            {recording && (
              <>
                <div className="rec-dot" />
                <div className="rec-timer">{formatTime(elapsed)}</div>
              </>
            )}
          </div>
        </div>

        <div className="practice-col practice-col-reference">
          {selected && selected.items && selected.items.length > 0 ? (
            <motion.div
              className="ideation-reference"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {selected.items.map((it, i) => (
                <div className="item" key={i}>
                  <div>
                    <span className="t">Text</span>
                    {it.text}
                  </div>
                  <div>
                    <span className="g">Gesture</span>
                    {it.gesture}
                  </div>
                </div>
              ))}
            </motion.div>
          ) : (
            <div className="empty" style={{ padding: 'var(--gap-4)' }}>
              Pick an ideation above to load its script + gestures here.
            </div>
          )}
        </div>
      </div>

      {/* Bottom: record button + error */}
      <div className="practice-bottom">
        {error && <p className="error">{error}</p>}
        <div className="practice-actions">
          {!cameraReady && !cameraLoading && !uploading && (
            <button className="btn" onClick={enableCamera}>Enable camera</button>
          )}
          {!recording ? (
            <button
              className="btn btn-primary"
              onClick={startRecording}
              disabled={!cameraReady || uploading || !selectedAlbumId}
            >
              {uploading ? 'Uploading…' : 'Start recording'}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={stopRecording}>
              Stop recording
            </button>
          )}
        </div>
      </div>
    </div>
  )
}