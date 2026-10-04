import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

export default function RequireAuth({ children, role }) {
  const { user, loading, token } = useAuth()
  const location = useLocation()

  if (loading) {
    return <p className="muted center">Loading…</p>
  }

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (role && user.role !== role) {
    return (
      <main className="panel">
        <h1>Not allowed</h1>
        <p className="muted">This page is for {role} accounts only.</p>
      </main>
    )
  }

  return children
}
