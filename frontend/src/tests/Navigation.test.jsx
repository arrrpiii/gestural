import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Nav from '../components/Nav.jsx'
import IdeationList from '../pages/IdeationList.jsx'
import { api } from '../api.js'

const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }))
vi.mock('../api.js', () => ({ api: { listIdeations: vi.fn(), createIdeation: vi.fn(), deleteIdeation: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.user = null })
it('keeps the same three navigation destinations and a single account action', () => {
  const view = render(<MemoryRouter><Nav /></MemoryRouter>)
  const nav = screen.getByRole('navigation', { name: 'Main navigation' })
  expect([...nav.querySelectorAll('a')].map((link) => [link.textContent, link.getAttribute('href')])).toEqual([['Home', '/'], ['Albums', '/albums'], ['Scripts', '/scripts']])
  expect(screen.getByText('Log in').getAttribute('href')).toBe('/login')
  auth.user = { name: 'Test' }
  view.rerender(<MemoryRouter><Nav /></MemoryRouter>)
  expect(screen.getByText('Account').getAttribute('href')).toBe('/account')
  expect(screen.queryByText('Pricing')).toBeNull()
})
it('creates a script on Scripts and passes it to the recording page', async () => {
  api.listIdeations.mockResolvedValue([])
  api.createIdeation.mockResolvedValue({ id: 'script-id', prompt: 'A short pitch', created_at: '2026-10-21', items: [{ text: 'Hello there', gesture: 'Open palms' }] })
  render(<MemoryRouter initialEntries={['/scripts']}><Routes><Route path="/scripts" element={<IdeationList />} /></Routes></MemoryRouter>)
  await screen.findByText('Your scripts will appear here.')
  fireEvent.change(screen.getByLabelText('What are you working on?'), { target: { value: 'A short pitch' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate script' }))
  expect(await screen.findByText('Hello there')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Use for recording' }).getAttribute('href')).toBe('/record?script=script-id')
  expect(api.createIdeation).toHaveBeenCalledWith('A short pitch')
})
it('keeps a failed script prompt for retry', async () => {
  api.listIdeations.mockResolvedValue([])
  api.createIdeation.mockRejectedValue(new Error('Please try again.'))
  render(<MemoryRouter><IdeationList /></MemoryRouter>)
  await screen.findByText('Your scripts will appear here.')
  fireEvent.change(screen.getByLabelText('What are you working on?'), { target: { value: 'My pitch' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate script' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByLabelText('What are you working on?').value).toBe('My pitch')
})
