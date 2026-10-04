import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Layout from '../components/Layout.jsx'
import RequireAuth from '../components/RequireAuth.jsx'
import { formatMoney } from '../utils/format.js'

function ConfirmationContent() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { token } = useAuth()

  const initial = location.state ?? {}
  const [hold, setHold] = useState(initial.hold ?? null)
  const [order, setOrder] = useState(initial.order ?? null)
  const [dropName] = useState(initial.dropName ?? '')
  const [slug] = useState(initial.slug ?? '')
  const [success, setSuccess] = useState(initial.success ?? order?.status === 'paid')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const holdId = searchParams.get('holdId') ?? hold?.id

  useEffect(() => {
    if (hold && order) return
    if (!holdId || !token) return

    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const data = await apiFetch(`/holds/${holdId}`, { token })
        if (cancelled) return
        setHold(data.hold)
        setOrder(data.order)
        setSuccess(data.order?.status === 'paid' || data.hold?.status === 'confirmed')
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
  }, [holdId, token, hold, order])

  const isFailed = hold?.status === 'held' && (!order || order.status === 'failed')

  return (
    <Layout title={success ? 'Order confirmed' : 'Payment failed'}>
      {loading ? <p className="muted center">Loading order…</p> : null}
      {error ? <p className="error center">{error}</p> : null}

      {!loading && !error && (hold || order) ? (
        <div className={`panel ${success ? 'panel-success' : 'panel-fail'}`}>
          {dropName ? <p className="muted">{dropName}</p> : null}
          {order ? (
            <>
              <p>
                Order <code>{order.id}</code>
              </p>
              <p className="price">{formatMoney(order.amountCents)}</p>
              {order.paymentRef ? (
                <p className="muted">Payment ref: {order.paymentRef}</p>
              ) : null}
            </>
          ) : (
            <p className="muted">Hold {hold?.status}</p>
          )}
        </div>
      ) : null}

      <p className="center">
        {isFailed && slug ? (
          <Link to={`/drops/${slug}/checkout`} className="btn btn-primary">
            Try payment again
          </Link>
        ) : (
          <Link to="/" className="btn btn-primary">
            Back to home
          </Link>
        )}
      </p>
    </Layout>
  )
}

export default function ConfirmationPage() {
  return (
    <RequireAuth role="shopper">
      <ConfirmationContent />
    </RequireAuth>
  )
}
