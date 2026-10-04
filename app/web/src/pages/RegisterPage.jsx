import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import Layout from '../components/Layout.jsx'

export default function RegisterPage() {
  const { register, user, loading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('shopper')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) {
    return <Navigate to={user.role === 'merchant' ? '/merchant' : '/'} replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await register(email, password, role)
      const dest = result.user.role === 'merchant' ? '/merchant' : '/'
      navigate(dest, { replace: true })
    } catch (err) {
      setError(err.message ?? 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout title="Create account">
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="shopper">Shopper</option>
            <option value="merchant">Merchant</option>
          </select>
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Register'}
        </button>
        <p className="muted">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </Layout>
  )
}
