const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export function getStore(storeId) {
  return request(`/store/${storeId}`)
}

export function getAnalysis(storeId) {
  return request(`/analysis/${storeId}`)
}

export function uploadCSV(formData) {
  return request('/ingest/csv', { method: 'POST', body: formData })
}
