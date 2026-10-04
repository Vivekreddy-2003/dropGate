import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Layout from '../components/Layout.jsx'
import RequireAuth from '../components/RequireAuth.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatDateTime } from '../utils/format.js'

function MerchantDropContent() {
  const { id } = useParams()
  const { token } = useAuth()

  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(`/drops/${id}/admin`, { token })
      setSnapshot(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [id, token])

  useEffect(() => {
    load()
    const intervalId = setInterval(load, 3000)
    return () => clearInterval(intervalId)
  }, [load])

  async function handleSchedule() {
    setBusy('schedule')
    try {
      await apiFetch(`/drops/${id}/schedule`, { method: 'POST', token })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleGoLive() {
    setBusy('live')
    try {
      await apiFetch(`/drops/${id}/go-live`, { method: 'POST', token })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const drop = snapshot?.drop
  const stats = snapshot?.stats
  const sku = snapshot?.skus?.[0]

  return (
    <Layout title={drop?.name ?? 'Control room'} subtitle="Schedule, go live, monitor stock">
      {!drop ? <p className="muted center">Loading…</p> : null}
      {error ? <p className="error center">{error}</p> : null}

      {drop ? (
        <div className="panel">
          <div className="card-top">
            <StatusBadge status={drop.status} />
            <span className="muted">/{drop.slug}</span>
          </div>
          <p className="muted">Goes live {formatDateTime(drop.goesLiveAt)}</p>
          {stats ? (
            <ul className="stats-list">
              <li>
                <strong>{stats.remainingQty}</strong> remaining
              </li>
              <li>
                <strong>{stats.activeHoldCount}</strong> active holds
              </li>
              <li>
                <strong>{stats.paidOrderCount}</strong> paid orders
              </li>
            </ul>
          ) : null}
          {sku ? <p className="muted">SKU: {sku.name}</p> : null}

          <div className="btn-row">
            {drop.status === 'draft' ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!!busy}
                onClick={handleSchedule}
              >
                Schedule drop
              </button>
            ) : null}
            {drop.status === 'scheduled' ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!!busy}
                onClick={handleGoLive}
              >
                Go live now
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <p className="center muted">
        <Link to="/merchant">Back to merchant home</Link>
      </p>
    </Layout>
  )
}

export default function MerchantDropPage() {
  return (
    <RequireAuth role="merchant">
      <MerchantDropContent />
    </RequireAuth>
  )
}
