export function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function formatMoney(cents, currency = 'INR') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function datetimeLocalToIso(value) {
  if (!value) return null
  return new Date(value).toISOString()
}
