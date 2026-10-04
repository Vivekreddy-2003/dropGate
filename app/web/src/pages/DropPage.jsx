import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Layout from '../components/Layout.jsx'
import RequireAuth from '../components/RequireAuth.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatMoney } from '../utils/format.js'

function DropContent() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()

  const [drop, setDrop] = useState(null)
  const [skus, setSkus] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [joinError, setJoinError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await apiFetch(`/drops/slug/${slug}`)
        if (cancelled) return
        setDrop(data.drop)
        setSkus(data.skus ?? [])

        if (token) {
          try {
            const me = await apiFetch(`/drops/${data.drop.id}/waiting-room/me`, { token })
            if (!cancelled && me.entry) {
              navigate(`/drops/${slug}/waiting`, { replace: true })
            }
          } catch {
            /* not in queue yet */
          }
        }
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
  }, [slug, token, navigate])

  const sku = skus[0]

  async function handleJoin() {
    if (!drop) return
    setJoinError(null)
    setBusy(true)
    try {
      await apiFetch(`/drops/${drop.id}/waiting-room`, { method: 'POST', token })
      navigate(`/drops/${slug}/waiting`)
    } catch (err) {
      setJoinError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <Layout>
        <p className="muted center">Loading drop…</p>
      </Layout>
    )
  }

  if (error || !drop) {
    return (
      <Layout title="Drop not found">
        <p className="error center">{error ?? 'Not found'}</p>
        <p className="center">
          <Link to="/">Back home</Link>
        </p>
      </Layout>
    )
  }

  return (
    <Layout title={drop.name}>
      <div className="panel">
        <div className="card-top">
          <StatusBadge status={drop.status} />
        </div>
        {sku ? (
          <>
            <p className="price">{formatMoney(sku.priceCents)}</p>
            <p className="muted">{sku.remainingQty} left in stock</p>
          </>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || drop.status === 'sold_out'}
          onClick={handleJoin}
        >
          {busy ? 'Joining…' : 'Join queue'}
        </button>
        {joinError ? <p className="error">{joinError}</p> : null}
      </div>
    </Layout>
  )
}

export default function DropPage() {
  return (
    <RequireAuth role="shopper">
      <DropContent />
    </RequireAuth>
  )
}
