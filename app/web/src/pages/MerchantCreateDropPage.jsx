import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Layout from '../components/Layout.jsx'
import RequireAuth from '../components/RequireAuth.jsx'
import { datetimeLocalToIso, slugify } from '../utils/format.js'

function defaultDatetimeLocal(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60_000)
  d.setSeconds(0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function MerchantCreateContent() {
  const { token } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [totalQty, setTotalQty] = useState(2)
  const [priceRupees, setPriceRupees] = useState(999)
  const [holdTtlMinutes, setHoldTtlMinutes] = useState(2)
  const [maxPerUser, setMaxPerUser] = useState(1)
  const [admitBatchSize, setAdmitBatchSize] = useState(2)
  const [registrationOpensAt, setRegistrationOpensAt] = useState(defaultDatetimeLocal(-60))
  const [goesLiveAt, setGoesLiveAt] = useState(defaultDatetimeLocal(5))
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  function handleNameChange(value) {
    setName(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const data = await apiFetch('/drops', {
        method: 'POST',
        token,
        body: {
          name,
          slug,
          registrationOpensAt: datetimeLocalToIso(registrationOpensAt),
          goesLiveAt: datetimeLocalToIso(goesLiveAt),
          holdTtlSeconds: holdTtlMinutes * 60,
          maxPerUser: Number(maxPerUser),
          admitBatchSize: Number(admitBatchSize),
          sku: {
            name: `${name} — Standard`,
            totalQty: Number(totalQty),
            priceCents: Math.round(Number(priceRupees) * 100),
          },
        },
      })
      navigate(`/merchant/drops/${data.drop.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout title="Create drop">
      <form className="panel form wide" onSubmit={handleSubmit}>
        <label>
          Name
          <input value={name} onChange={(e) => handleNameChange(e.target.value)} required />
        </label>
        <label>
          Slug
          <input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(e.target.value)
            }}
            required
          />
        </label>
        <div className="form-row">
          <label>
            Total quantity
            <input
              type="number"
              min={1}
              value={totalQty}
              onChange={(e) => setTotalQty(e.target.value)}
              required
            />
          </label>
          <label>
            Price (₹)
            <input
              type="number"
              min={1}
              value={priceRupees}
              onChange={(e) => setPriceRupees(e.target.value)}
              required
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Hold TTL (minutes)
            <input
              type="number"
              min={1}
              value={holdTtlMinutes}
              onChange={(e) => setHoldTtlMinutes(e.target.value)}
              required
            />
          </label>
          <label>
            Max per user
            <input
              type="number"
              min={1}
              value={maxPerUser}
              onChange={(e) => setMaxPerUser(e.target.value)}
              required
            />
          </label>
          <label>
            Admit batch size
            <input
              type="number"
              min={1}
              value={admitBatchSize}
              onChange={(e) => setAdmitBatchSize(e.target.value)}
              required
            />
          </label>
        </div>
        <label>
          Registration opens
          <input
            type="datetime-local"
            value={registrationOpensAt}
            onChange={(e) => setRegistrationOpensAt(e.target.value)}
            required
          />
        </label>
        <label>
          Goes live
          <input
            type="datetime-local"
            value={goesLiveAt}
            onChange={(e) => setGoesLiveAt(e.target.value)}
            required
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create drop'}
        </button>
      </form>
    </Layout>
  )
}

export default function MerchantCreateDropPage() {
  return (
    <RequireAuth role="merchant">
      <MerchantCreateContent />
    </RequireAuth>
  )
}
