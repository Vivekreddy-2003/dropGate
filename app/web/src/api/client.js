export class ApiError extends Error {
  constructor({ code, message, status }) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export async function apiFetch(
  path,
  { method = 'GET', body, token, idempotencyKey } = {},
) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey
  }

  let res
  try {
    res = await fetch(`${API_BASE}/api/v1${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError({
      code: 'NETWORK',
      message: `Cannot reach API at ${API_BASE}. Start it with: cd app/api && npm run dev`,
      status: 0,
    })
  }

  const text = await res.text()
  let data = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = {}
    }
  }

  if (!res.ok) {
    const err = data.error ?? {}
    throw new ApiError({
      code: err.code ?? 'UNKNOWN',
      message: err.message ?? res.statusText,
      status: res.status,
    })
  }

  return data
}
