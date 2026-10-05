import { afterEach, expect, it, vi } from 'vitest'
import { api, setToken } from '../api.js'

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

it('sends authentication and parses validation errors', async () => {
  setToken('test-token')
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    detail: [{ loc: ['body', 'password'], msg: 'Too long' }],
  }), { status: 422, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetch)
  await expect(api.register({ password: 'example' })).rejects.toThrow('password: Too long')
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token')
})

it('keeps HTTP status for authentication handling', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"Expired"}', {
    status: 401, headers: { 'content-type': 'application/json' },
  })))
  await expect(api.me()).rejects.toMatchObject({ status: 401, message: 'Expired' })
})

it('accepts empty delete responses', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
  await expect(api.deleteSession('id')).resolves.toBeNull()
})
