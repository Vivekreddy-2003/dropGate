import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Layout({ children, title, subtitle }) {
  const { user, logout } = useAuth()

  return (
    <div className="layout">
      <header className="site-header">
        <Link to={user?.role === 'merchant' ? '/merchant' : '/'} className="brand">
          Dropgate
        </Link>
        {user ? (
          <div className="header-actions">
            <span className="muted">{user.email}</span>
            <button type="button" className="btn btn-ghost" onClick={logout}>
              Log out
            </button>
          </div>
        ) : null}
      </header>
      {(title || subtitle) && (
        <div className="page-heading">
          {title ? <h1>{title}</h1> : null}
          {subtitle ? <p className="muted">{subtitle}</p> : null}
        </div>
      )}
      {children}
    </div>
  )
}
