import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App.jsx'
import { api } from '../api.js'

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: null, loading: false }) }))
vi.mock('../api.js', () => ({ api: { albums: { list: vi.fn() }, listIdeations: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
function visit(path) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}
it('shows album examples without fetching private albums and switches the comparison', () => {
  visit('/albums')
  expect(screen.getByText('Example workspace')).toBeTruthy()
  expect(screen.getByText('Product pitch: progress review')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Weekly update/ }))
  expect(screen.getByText('Weekly update: progress review')).toBeTruthy()
  expect(api.albums.list).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe('/register')
})
it('shows selectable scripts without fetching private scripts', () => {
  visit('/scripts')
  expect(screen.getByRole('table')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Share a short project update with your team' }))
  expect(screen.getByText('This week, we finished the first version of the project.')).toBeTruthy()
  expect(api.listIdeations).not.toHaveBeenCalled()
})
it('describes recording and review features on the signed-out home page', () => {
  visit('/')
  expect(screen.getByText('Record in your browser.')).toBeTruthy()
  expect(screen.getByText('Know what to practise next.')).toBeTruthy()
  expect(screen.getByRole('link', { name: /Explore albums/ }).getAttribute('href')).toBe('/albums')
})
