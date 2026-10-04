import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import Layout from '../components/Layout.jsx'

export default function LoginPage() {
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) {
    const dest = user.role === 'merchant' ? '/merchant' : from || '/'
    return <Navigate to={dest} replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await login(email, password)
      const dest = result.user.role === 'merchant' ? '/merchant' : from || '/'
      navigate(dest, { replace: true })
    } catch (err) {
      setError(err.message ?? 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout title="Sign in">
      <form className="panel form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted">
          No account? <Link to="/register">Register</Link>
        </p>
      </form>
    </Layout>
  )
}
