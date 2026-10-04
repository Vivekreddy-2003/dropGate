import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../api/client.js'

const TOKEN_KEY = 'token'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const persistSession = useCallback((nextToken, nextUser) => {
    localStorage.setItem(TOKEN_KEY, nextToken)
    setToken(nextToken)
    setUser(nextUser)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      const stored = localStorage.getItem(TOKEN_KEY)
      if (!stored) {
        if (!cancelled) setLoading(false)
        return
      }

      try {
        const { user: me } = await apiFetch('/auth/me', { token: stored })
        if (!cancelled) {
          setToken(stored)
          setUser(me)
        }
      } catch {
        if (!cancelled) clearSession()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    restoreSession()
    return () => {
      cancelled = true
    }
  }, [clearSession])

  const login = useCallback(
    async (email, password) => {
      const result = await apiFetch('/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      persistSession(result.token, result.user)
      return result
    },
    [persistSession],
  )

  const register = useCallback(
    async (email, password, role) => {
      const result = await apiFetch('/auth/register', {
        method: 'POST',
        body: { email, password, role },
      })
      persistSession(result.token, result.user)
      return result
    },
    [persistSession],
  )

  const logout = useCallback(() => {
    clearSession()
  }, [clearSession])

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout }),
    [user, token, loading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
