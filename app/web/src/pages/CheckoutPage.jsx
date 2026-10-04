import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Countdown from '../components/Countdown.jsx'
import Layout from '../components/Layout.jsx'
import RequireAuth from '../components/RequireAuth.jsx'
import { formatMoney } from '../utils/format.js'

function CheckoutContent() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()

  const [drop, setDrop] = useState(null)
  const [sku, setSku] = useState(null)
  const [hold, setHold] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await apiFetch(`/drops/slug/${slug}`)
        if (cancelled) return
        setDrop(data.drop)
        setSku(data.skus?.[0] ?? null)

        const me = await apiFetch(`/drops/${data.drop.id}/waiting-room/me`, { token })
        if (me.entry?.status !== 'admitted') {
          navigate(`/drops/${slug}/waiting`, { replace: true })
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [slug, token, navigate])

  const refreshHold = useCallback(async () => {
    if (!hold?.id) return
    try {
      const data = await apiFetch(`/holds/${hold.id}`, { token })
      setHold(data.hold)
    } catch (err) {
      setError(err.message)
    }
  }, [hold?.id, token])

  async function handleReserve() {
    if (!sku) return
    setError(null)
    setBusy('reserve')
    try {
      const data = await apiFetch('/holds', {
        method: 'POST',
        token,
        body: { skuId: sku.id, qty: 1 },
        idempotencyKey: crypto.randomUUID(),
      })
      setHold(data.hold)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handlePay(result) {
    if (!hold) return
    setError(null)
    setBusy(result)
    try {
      const data = await apiFetch(`/holds/${hold.id}/pay`, {
        method: 'POST',
        token,
        body: { result },
        idempotencyKey: crypto.randomUUID(),
      })
      setHold(data.hold)
      if (result === 'success') {
        navigate('/orders/success', {
          state: {
            hold: data.hold,
            order: data.order,
            dropName: drop?.name,
            slug,
            success: true,
          },
        })
      } else {
        setError('Payment failed. Try again before hold expires.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleCancel() {
    if (!hold) return
    setBusy('cancel')
    try {
      await apiFetch(`/holds/${hold.id}/cancel`, { method: 'POST', token })
      setHold(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const holdActive = hold?.status === 'held'

  return (
    <Layout title="Checkout" subtitle={drop?.name}>
      {sku ? <p className="price center">{formatMoney(sku.priceCents)}</p> : null}

      {!hold ? (
        <div className="panel center">
          <p className="muted">Reserve one unit to start the checkout timer.</p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy === 'reserve'}
            onClick={handleReserve}
          >
            {busy === 'reserve' ? 'Reserving…' : 'Reserve'}
          </button>
        </div>
      ) : null}

      {hold ? (
        <div className="panel checkout-panel">
          <p className="muted center">Hold expires in</p>
          {holdActive && hold.expiresAt ? (
            <Countdown expiresAt={hold.expiresAt} onExpire={refreshHold} />
          ) : (
            <p className="error center">Hold {hold.status}</p>
          )}

          {holdActive ? (
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!!busy}
                onClick={() => handlePay('success')}
              >
                Pay success
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!!busy}
                onClick={() => handlePay('fail')}
              >
                Pay fail
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!!busy}
                onClick={handleCancel}
              >
                Cancel hold
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="error center">{error}</p> : null}
      <p className="center muted">
        <Link to={`/drops/${slug}/waiting`}>Back to waiting room</Link>
      </p>
    </Layout>
  )
}

export default function CheckoutPage() {
  return (
    <RequireAuth role="shopper">
      <CheckoutContent />
    </RequireAuth>
  )
}
