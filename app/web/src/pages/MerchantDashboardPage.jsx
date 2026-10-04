import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Layout from '../components/Layout.jsx'
import RequireAuth from '../components/RequireAuth.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatDateTime } from '../utils/format.js'

function MerchantDashboardContent() {
  const { token } = useAuth()
  const [drops, setDrops] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // The merchant's own drops (any status, incl. draft) — scoped by the JWT.
        const data = await apiFetch('/drops/mine', { token })
        if (!cancelled) setDrops(data.drops ?? [])
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <Layout title="Merchant" subtitle="Create and run drops">
      <div className="panel">
        <Link to="/merchant/drops/new" className="btn btn-primary">
          Create new drop
        </Link>
      </div>

      <h2 style={{ marginTop: '1.5rem' }}>Your drops</h2>
      {loading ? <p className="muted center">Loading your drops…</p> : null}
      {error ? <p className="error center">{error}</p> : null}
      {!loading && !error && drops.length === 0 ? (
        <p className="muted center panel">
          You haven&apos;t created any drops yet. Create one to get started.
        </p>
      ) : null}

      <ul className="card-grid">
        {drops.map((drop) => (
          <li key={drop.id}>
            <Link to={`/merchant/drops/${drop.id}`} className="card">
              <div className="card-top">
                <h2>{drop.name}</h2>
                <StatusBadge status={drop.status} />
              </div>
              <p className="muted">Goes live {formatDateTime(drop.goesLiveAt)}</p>
              <p className="muted">
                Stock: {drop.stats?.remainingQty ?? 0} / {drop.stats?.totalQty ?? 0} left
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </Layout>
  )
}

export default function MerchantDashboardPage() {
  return (
    <RequireAuth role="merchant">
      <MerchantDashboardContent />
    </RequireAuth>
  )
}
