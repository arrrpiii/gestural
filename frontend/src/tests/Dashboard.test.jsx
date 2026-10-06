import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import Dashboard from '../pages/Dashboard.jsx'
import { api } from '../api.js'

vi.mock('../api.js', () => ({ api: { albums: { list: vi.fn() } } }))
afterEach(cleanup)
it('shows Loading until albums arrive, without flashing the empty state', async () => {
  let resolve
  api.albums.list.mockReturnValue(new Promise((done) => { resolve = done }))
  render(<Dashboard />)
  expect(screen.getByRole('status').textContent).toBe('Loading')
  expect(screen.queryByText(/No albums yet/)).toBeNull()
  await act(async () => resolve([{ id: 'album', name: 'My pitch', session_count: 0 }]))
  expect(screen.queryByText('Loading')).toBeNull()
  expect(screen.getByText('My pitch')).toBeTruthy()
  expect(screen.queryByText(/No albums yet/)).toBeNull()
})
it('shows the empty state only after a successful empty response', async () => {
  api.albums.list.mockResolvedValue([])
  render(<Dashboard />)
  expect(await screen.findByText(/No albums yet/)).toBeTruthy()
  expect(screen.queryByText('Loading')).toBeNull()
})
it('shows fetch errors instead of claiming no albums exist', async () => {
  api.albums.list.mockRejectedValue(new Error('Network unavailable'))
  render(<Dashboard />)
  expect((await screen.findByRole('alert')).textContent).toBe('Network unavailable')
  expect(screen.queryByText(/No albums yet/)).toBeNull()
})
