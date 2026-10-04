import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import Layout from '../components/Layout.jsx'
import RequireAuth from '../components/RequireAuth.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatDateTime } from '../utils/format.js'

function HomeContent() {
  const [drops, setDrops] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await apiFetch('/drops')
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
  }, [])

  return (
    <Layout title="Launches" subtitle="Pick a drop and join the queue">
      {loading ? <p className="muted center">Loading drops…</p> : null}
      {error ? <p className="error center">{error}</p> : null}
      {!loading && !error && drops.length === 0 ? (
        <p className="muted center panel">No live drops yet. Check back soon.</p>
      ) : null}
      <ul className="card-grid">
        {drops.map((drop) => (
          <li key={drop.id}>
            <Link to={`/drops/${drop.slug}`} className="card">
              <div className="card-top">
                <h2>{drop.name}</h2>
                <StatusBadge status={drop.status} />
              </div>
              <p className="muted">Goes live {formatDateTime(drop.goesLiveAt)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Layout>
  )
}

export default function HomePage() {
  return (
    <RequireAuth role="shopper">
      <HomeContent />
    </RequireAuth>
  )
}
