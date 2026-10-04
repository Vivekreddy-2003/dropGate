import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Layout from '../components/Layout.jsx'
import RequireAuth from '../components/RequireAuth.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

function WaitingContent() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()

  const [dropId, setDropId] = useState(null)
  const [dropName, setDropName] = useState('')
  const [entry, setEntry] = useState(null)
  const [aheadCount, setAheadCount] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    apiFetch(`/drops/slug/${slug}`)
      .then((data) => {
        if (!cancelled) {
          setDropId(data.drop.id)
          setDropName(data.drop.name)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (!dropId || !token) return undefined

    let cancelled = false
    let intervalId

    async function poll() {
      try {
        const data = await apiFetch(`/drops/${dropId}/waiting-room/me`, { token })
        if (cancelled) return
        setEntry(data.entry)
        setAheadCount(data.aheadCount)
        setError(null)

        const status = data.entry?.status
        if (status === 'admitted' || status === 'purchased') {
          clearInterval(intervalId)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    poll()
    intervalId = setInterval(poll, 2000)
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [dropId, token])

  const status = entry?.status

  return (
    <Layout title={dropName || 'Waiting room'} subtitle="Hold tight — we refresh every 2s">
      {error ? <p className="error center">{error}</p> : null}
      {entry ? (
        <div className="waiting-hero panel">
          <p className="muted">People ahead of you</p>
          <div className="queue-number">{aheadCount ?? '—'}</div>
          <StatusBadge status={status} />
          <p className="muted">Queue position #{entry.position}</p>
        </div>
      ) : (
        <p className="muted center">Loading your place in line…</p>
      )}

      {status === 'admitted' ? (
        <div className="center">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate(`/drops/${slug}/checkout`)}
          >
            Continue to checkout
          </button>
        </div>
      ) : null}

      {status === 'purchased' ? (
        <p className="center muted">
          You already purchased. <Link to="/">Back home</Link>
        </p>
      ) : null}

      {status === 'queued' ? (
        <p className="center muted">
          <Link to={`/drops/${slug}`}>Back to drop</Link>
        </p>
      ) : null}
    </Layout>
  )
}

export default function WaitingRoomPage() {
  return (
    <RequireAuth role="shopper">
      <WaitingContent />
    </RequireAuth>
  )
}
