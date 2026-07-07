/**
 * Lightweight fetch wrapper.
 * - Reads JWT from localStorage.
 * - Adds Authorization header when present.
 * - Throws Error with backend message on non-2xx.
 */
const TOKEN_KEY = 'gestura_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request(path, { method = 'GET', body, headers = {}, isForm = false } = {}) {
  const token = getToken()
  const finalHeaders = { ...headers }
  if (token) finalHeaders.Authorization = `Bearer ${token}`
  let payload = body
  if (body && !isForm) {
    finalHeaders['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(path, { method, headers: finalHeaders, body: payload })
  if (res.status === 204) return null
  const contentType = res.headers.get('content-type') || ''
  const data = contentType.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok) {
    const msg = (data && data.detail) || (typeof data === 'string' ? data : 'Request failed')
    throw new Error(msg)
  }
  return data
}

export const api = {
  // auth
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  me: () => request('/api/auth/me'),

  // ideation
  createIdeation: (prompt) => request('/api/ideation', { method: 'POST', body: { prompt } }),
  listIdeations: () => request('/api/ideation'),
  getIdeation: (id) => request(`/api/ideation/${id}`),
  deleteIdeation: (id) => request(`/api/ideation/${id}`, { method: 'DELETE' }),

  // sessions
  uploadSession: (formData) =>
    request('/api/sessions', { method: 'POST', body: formData, isForm: true }),
  listSessions: () => request('/api/sessions'),
  getSession: (id) => request(`/api/sessions/${id}`),
  updateSession: (id, body) => request(`/api/sessions/${id}`, { method: 'PATCH', body }),
  deleteSession: (id) => request(`/api/sessions/${id}`, { method: 'DELETE' }),
  reReviewSession: (id) => request(`/api/sessions/${id}/re-review`, { method: 'POST' }),
  videoUrl: (id) => `/api/sessions/${id}/video`,
}
