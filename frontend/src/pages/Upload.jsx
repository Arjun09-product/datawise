import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadCSV } from '../lib/api'
import { track } from '../lib/posthog'

const GOALS = [
  { value: 'grow_repeat_rate', label: 'Grow repeat rate' },
  { value: 'increase_aov', label: 'Increase AOV' },
  { value: 'reduce_churn', label: 'Reduce churn' },
  { value: 'grow_revenue', label: 'Grow revenue' },
]

export default function Upload() {
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [goal, setGoal] = useState('')
  const [storeName, setStoreName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith('.csv')) setFile(dropped)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!file || !goal || !storeName) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('goal', goal)
      fd.append('store_name', storeName)
      const res = await uploadCSV(fd)
      track('csv_uploaded', { store_id: res.store_id, row_count: res.rows_processed })
      track('goal_selected', { goal })
      localStorage.setItem('store_id', res.store_id)
      localStorage.setItem('store_name', storeName)
      localStorage.setItem('store_goal', goal)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0e0f11', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f1f1f1', marginBottom: 8, letterSpacing: '-0.5px' }}>
          <span style={{ color: '#00d97e' }}>Datawise</span>
        </h1>
        <p style={{ color: '#6b7280', marginBottom: 36, fontSize: 15 }}>
          Upload your store data and get AI-powered next steps.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Store name</label>
            <input
              type="text"
              placeholder="My Shopify Store"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Your goal</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {GOALS.map(g => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGoal(g.value)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: goal === g.value ? '1px solid #00d97e' : '1px solid #2e2f33',
                    background: goal === g.value ? 'rgba(0,217,126,0.1)' : '#161719',
                    color: goal === g.value ? '#00d97e' : '#9ca3af',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>Orders CSV</label>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? '#00d97e' : file ? '#00d97e' : '#2e2f33'}`,
                borderRadius: 12,
                padding: '32px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragging ? 'rgba(0,217,126,0.05)' : '#161719',
                transition: 'all 0.15s',
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={e => setFile(e.target.files[0])}
              />
              {file ? (
                <p style={{ color: '#00d97e', fontSize: 14, fontWeight: 500 }}>✓ {file.name}</p>
              ) : (
                <>
                  <p style={{ color: '#f1f1f1', fontSize: 14, marginBottom: 4 }}>Drop your CSV here or click to browse</p>
                  <p style={{ color: '#6b7280', fontSize: 12 }}>Needs: order_id, email, order_date, total</p>
                </>
              )}
            </div>
          </div>

          {error && (
            <p style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !file || !goal || !storeName}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 10,
              border: 'none',
              background: '#00d97e',
              color: '#0e0f11',
              fontSize: 15,
              fontWeight: 700,
              cursor: loading || !file || !goal || !storeName ? 'not-allowed' : 'pointer',
              opacity: loading || !file || !goal || !storeName ? 0.5 : 1,
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {loading ? 'Uploading…' : 'Analyse my store →'}
          </button>
        </form>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  fontSize: 13,
  color: '#9ca3af',
  fontWeight: 500,
  marginBottom: 8,
}

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 8,
  border: '1px solid #2e2f33',
  background: '#161719',
  color: '#f1f1f1',
  fontSize: 14,
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
}
