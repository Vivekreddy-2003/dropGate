import { useEffect, useState } from 'react'

function remainingMs(expiresAt) {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now())
}

function formatRemaining(ms) {
  const totalSec = Math.ceil(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function Countdown({ expiresAt, onExpire }) {
  const [ms, setMs] = useState(() => remainingMs(expiresAt))

  useEffect(() => {
    setMs(remainingMs(expiresAt))
    const id = setInterval(() => {
      const next = remainingMs(expiresAt)
      setMs(next)
      if (next === 0 && onExpire) onExpire()
    }, 1000)
    return () => clearInterval(id)
  }, [expiresAt, onExpire])

  const urgent = ms > 0 && ms < 60_000

  return (
    <div className={`countdown ${urgent ? 'countdown-urgent' : ''}`} aria-live="polite">
      {formatRemaining(ms)}
    </div>
  )
}
