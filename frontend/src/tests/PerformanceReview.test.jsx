import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PerformanceReview from '../components/PerformanceReview.jsx'
import { api } from '../api.js'

vi.mock('../api.js', () => ({ api: { albums: { performance: vi.fn(), reviewPerformance: vi.fn() } } }))
const available = { report: null, stale: false, reviewed_count: 2, recording_count: 2 }
const report = {
  summary: 'Your opening is clearer in the latest take.', generated_at: '2026-10-21T10:00:00Z', excluded_count: 0,
  recordings: [{ id: 'first', name: 'Opening baseline' }, { id: 'last', name: 'Latest take' }],
  dimensions: [{ dimension: 'clarity', trend: 'improved', baseline: 'Opening needed focus.', latest: 'Opening is clear.',
    explanation: 'The latest feedback reports a clearer opening.', next_step: 'Repeat the concise opening.',
    evidence: [{ session_id: 'first', quote: 'Needs a clearer opening.' }, { session_id: 'last', quote: 'Clear opening.' }],
  }],
}
const show = () => render(<MemoryRouter><PerformanceReview albumId="album" /></MemoryRouter>)
beforeEach(() => {
  vi.clearAllMocks()
  api.albums.performance.mockResolvedValue(available)
  api.albums.reviewPerformance.mockResolvedValue({ ...available, report })
})
afterEach(cleanup)

it('generates a structured baseline/latest comparison with evidence links', async () => {
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Review progress' }))
  await screen.findByText(report.summary)
  expect(api.albums.reviewPerformance).toHaveBeenCalledWith('album')
  expect(screen.getByText('Baseline take')).toBeTruthy()
  expect(screen.getByText('Opening needed focus.')).toBeTruthy()
  expect(screen.getByText('Improved')).toBeTruthy()
  expect(screen.getByText(/Repeat the concise opening/)).toBeTruthy()
  expect(screen.getAllByRole('link', { name: /Opening baseline/ })[0].getAttribute('href')).toBe('/history/first')
})
it('does not generate on opening or regenerate a cached report', async () => {
  api.albums.performance.mockResolvedValue({ ...available, report })
  show()
  await screen.findByText(report.summary)
  expect(api.albums.reviewPerformance).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Review progress' })).toBeNull()
})
it('requires two reviewed recordings', async () => {
  api.albums.performance.mockResolvedValue({ ...available, reviewed_count: 1 })
  show()
  expect((await screen.findByRole('button', { name: 'Review progress' })).disabled).toBe(true)
  expect(screen.getByText(/Add at least two recordings/)).toBeTruthy()
})
it('explains stale reports and lets the user update them', async () => {
  api.albums.performance.mockResolvedValue({ ...available, stale: true })
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Update performance review' }))
  await screen.findByText(report.summary)
})
it('shows comparison errors and allows retrying', async () => {
  api.albums.reviewPerformance.mockRejectedValueOnce(new Error('Please try again'))
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Review progress' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Please try again')
  fireEvent.click(screen.getByRole('button', { name: 'Review progress' }))
  await screen.findByText(report.summary)
})
it('disables duplicate requests while comparing', async () => {
  let resolve
  api.albums.reviewPerformance.mockReturnValue(new Promise((done) => { resolve = done }))
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Review progress' }))
  expect(screen.getByRole('button', { name: 'Comparing…' }).disabled).toBe(true)
  await act(async () => resolve({ ...available, report }))
  expect(api.albums.reviewPerformance).toHaveBeenCalledTimes(1)
})
