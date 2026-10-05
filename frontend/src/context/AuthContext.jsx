import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, getToken, setToken } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Hydrate user from token in localStorage on first load.
  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      if (!getToken()) {
        setLoading(false)
        return
      }
      try {
        const me = await api.me()
        if (!cancelled) setUser(me)
      } catch (e) {
        if (!cancelled && e.status === 401) setToken(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    hydrate()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email, password) => {
    setError(null)
    try {
      const { token, user: u } = await api.login({ email, password })
      setToken(token)
      setUser(u)
      return u
    } catch (e) {
      setError(e.message)
      throw e
    }
  }, [])

  const register = useCallback(async (email, password, name) => {
    setError(null)
    try {
      const { token, user: u } = await api.register({ email, password, name })
      setToken(token)
      setUser(u)
      return u
    } catch (e) {
      setError(e.message)
      throw e
    }
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
