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
  expect(stopTrack).toHaveBeenCalled()
})

it('releases the camera immediately while the upload is still pending', async () => {
  api.uploadSession.mockReturnValue(new Promise(() => {}))
  const view = await start()
  fireEvent.click(screen.getByText('Stop recording'))
  expect(stopTrack).toHaveBeenCalled()
  expect(view.container.querySelector('video').srcObject).toBeNull()
  expect(screen.getByText('Uploading…').disabled).toBe(true)
  expect(screen.getByText('Camera off')).toBeTruthy()
})

it('keeps the camera off after a failed upload and allows explicitly enabling it again', async () => {
  api.uploadSession.mockRejectedValue(new Error('Upload failed'))
  await start()
  fireEvent.click(screen.getByText('Stop recording'))
  await screen.findByText('Upload failed')
  expect(stopTrack).toHaveBeenCalled()
  expect(screen.getByText('Start recording').disabled).toBe(true)
  fireEvent.click(screen.getByText('Enable camera'))
  await waitFor(() => expect(screen.getByText('Start recording').disabled).toBe(false))
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2)
})

it('releases devices before the asynchronous recorder flush and still uploads the final chunk', async () => {
  api.uploadSession.mockClear()
  await start()
  recorder.stop = () => { recorder.state = 'inactive' }
  fireEvent.click(screen.getByText('Stop recording'))
  expect(stopTrack).toHaveBeenCalled()
  expect(api.uploadSession).not.toHaveBeenCalled()
  expect(screen.getByText('Uploading…').disabled).toBe(true)
  await act(async () => {
    recorder.ondataavailable({ data: new Blob(['final chunk'], { type: 'video/mp4' }) })
    recorder.onstop()
  })
  expect(api.uploadSession).toHaveBeenCalledTimes(1)
  expect(api.uploadSession.mock.calls[0][0].get('video').size).toBe(11)
})
