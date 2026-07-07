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

  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [ideations, setIdeations] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [selected, setSelected] = useState(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [sessionName, setSessionName] = useState('')

  // Load ideations for the dropdown.
  useEffect(() => {
    api.listIdeations().then(setIdeations).catch(() => setIdeations([]))
  }, [])

  // Acquire webcam stream on mount.
  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setCameraReady(true)
      } catch (e) {
        setError('Camera or microphone permission denied. Please allow access and reload.')
      }
    }
    start()
    return () => {
      cancelled = true
      stopStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recording timer.
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => {
      setElapsed((s) => {
        if (s + 1 >= MAX_SECONDS) {
          stopRecording()
          return MAX_SECONDS
        }
        return s + 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [recording])

  // Load selected ideation's items.
  useEffect(() => {
    if (!selectedId) {
      setSelected(null)
      return
    }
    api.getIdeation(selectedId).then(setSelected).catch(() => setSelected(null))
  }, [selectedId])

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  function startRecording() {
    if (!streamRef.current) return
    chunksRef.current = []
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
    recorder.onstop = () => uploadRecording()
    recorder.start()
    recorderRef.current = recorder
    setElapsed(0)
    setRecording(true)
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    setRecording(false)
  }

  async function uploadRecording() {
    const blob = new Blob(chunksRef.current, { type: 'video/webm' })
    chunksRef.current = []
    if (blob.size === 0) {
      setError('No video captured.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('video', blob, 'recording.webm')
      if (selectedId) form.append('ideation_id', selectedId)
      if (sessionName.trim()) form.append('name', sessionName.trim())
      const session = await api.uploadSession(form)
      navigate(`/history/${session.id}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="practice-layout">
      <h1 className="page-title">Practice</h1>

      {/* Top: name + ideation dropdown, full width */}
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
          <label className="field-label" htmlFor="ideation-select">
            Reference an ideation (optional)
          </label>
          <select
            id="ideation-select"
            className="select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={recording}
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
                {error || 'Requesting camera…'}
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
          {!recording ? (
            <button
              className="btn btn-primary"
              onClick={startRecording}
              disabled={!cameraReady || uploading}
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