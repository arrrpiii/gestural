import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Practice from '../pages/Practice.jsx'
import { api } from '../api.js'

vi.mock('../api.js', () => ({ api: {
  listIdeations: vi.fn(), getIdeation: vi.fn(), uploadSession: vi.fn(), albums: { list: vi.fn() },
} }))
let recorder
let stopTrack
beforeEach(() => {
  stopTrack = vi.fn()
  api.listIdeations.mockResolvedValue([])
  api.albums.list.mockResolvedValue([{ id: 'album', name: 'My album' }])
  api.uploadSession.mockResolvedValue({ id: 'saved' })
  vi.stubGlobal('MediaRecorder', class {
    static isTypeSupported(type) { return type === 'video/mp4' }
    constructor() { this.mimeType = 'video/mp4'; this.state = 'inactive'; recorder = this }
    start() { this.state = 'recording' }
    stop() {
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob(['video'], { type: 'video/mp4' }) })
      this.onstop?.()
    }
  })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }),
  } })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })
async function start() {
  const view = render(<MemoryRouter><Practice /></MemoryRouter>)
  await screen.findByText('My album')
  fireEvent.change(screen.getByLabelText('Album *'), { target: { value: 'album' } })
  await waitFor(() => expect(screen.getByText('Start recording').disabled).toBe(false))
  fireEvent.click(screen.getByText('Start recording'))
  return view
}

it('uploads MP4 recordings with the actual container and extension', async () => {
  await start()
  fireEvent.click(screen.getByText('Stop recording'))
  await waitFor(() => expect(api.uploadSession).toHaveBeenCalled())
  const form = api.uploadSession.mock.calls.at(-1)[0]
  expect(form.get('video').type).toBe('video/mp4')
  expect(form.get('video').name).toBe('recording.mp4')
  expect(form.get('album_id')).toBe('album')
})

it('stops devices without uploading an abandoned take', async () => {
  api.uploadSession.mockClear()
  const view = await start()
  view.unmount()
  expect(recorder.state).toBe('inactive')
  expect(stopTrack).toHaveBeenCalled()
  expect(api.uploadSession).not.toHaveBeenCalled()
})

it('automatically stops at the recording limit', async () => {
  api.uploadSession.mockClear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await start()
  await act(async () => { vi.advanceTimersByTime(120000) })
  expect(recorder.state).toBe('inactive')
  expect(api.uploadSession).toHaveBeenCalledTimes(1)
})
