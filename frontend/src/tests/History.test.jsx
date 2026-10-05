import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import History from '../pages/History.jsx'
import { api } from '../api.js'

vi.mock('../api.js', () => ({ getToken: () => 'token', api: {
  getSession: vi.fn(), videoUrl: () => '/video', reReviewSession: vi.fn(), updateSession: vi.fn(),
} }))
beforeEach(() => {
  api.getSession.mockResolvedValue({ id: 'one', name: 'Take', review: 'Review unavailable. Please try Re-review later.' })
  api.reReviewSession.mockRejectedValue(new Error('Coach is unavailable'))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['video']) }))
  URL.createObjectURL = vi.fn(() => 'blob:video')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function show() {
  return render(<MemoryRouter initialEntries={['/history/one']}><Routes>
    <Route path="/history/:id" element={<History />} />
  </Routes></MemoryRouter>)
}
it('renders unstructured review feedback and action failures', async () => {
  show()
  await screen.findByText('Review unavailable. Please try Re-review later.')
  fireEvent.click(screen.getByRole('button', { name: 'Re-review' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Coach is unavailable')
})
it('surfaces rename errors without losing the current session', async () => {
  api.updateSession.mockRejectedValue(new Error('Save failed'))
  show()
  const input = await screen.findByLabelText('Session name')
  fireEvent.change(input, { target: { value: 'New name' } })
  fireEvent.blur(input)
  expect((await screen.findByRole('alert')).textContent).toBe('Save failed')
  expect(screen.getByLabelText('Session name').value).toBe('New name')
})
