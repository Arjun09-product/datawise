import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadCSV, loadDemo, validateGoal } from '../lib/api'
import { track } from '../lib/posthog'

const CATEGORIES = [
  { value: 'clothing',     label: 'Clothing',     icon: '👗' },
  { value: 'beauty',       label: 'Beauty',        icon: '💄' },
  { value: 'electronics',  label: 'Electronics',   icon: '📱' },
  { value: 'food',         label: 'Food & Drink',  icon: '🍕' },
  { value: 'home',         label: 'Home & Garden', icon: '🏠' },
  { value: 'sports',       label: 'Sports',        icon: '🏋️' },
  { value: 'other',        label: 'Other',         icon: '💡' },
]

const PRESET_GOALS = [
  { value: 'grow_repeat_rate', label: 'Grow repeat rate' },
  { value: 'increase_aov',     label: 'Increase AOV' },
  { value: 'reduce_churn',     label: 'Reduce churn' },
  { value: 'grow_revenue',     label: 'Grow revenue' },
  { value: 'custom',           label: '+ Custom goal' },
]

function saveStoreData(res) {
  localStorage.setItem('store_id',   res.store_id)
  localStorage.setItem('store_name', res.store.name)
  localStorage.setItem('store_goal', res.store.goal)
  localStorage.setItem('store_data', JSON.stringify(res))
}

export default function Upload() {
  const navigate = useNavigate()
  const fileRef  = useRef(null)

  const [storeName,    setStoreName]    = useState('')
  const [category,     setCategory]     = useState('')
  const [goalKey,      setGoalKey]      = useState('')
  const [customGoal,   setCustomGoal]   = useState('')
  const [validatedGoal, setValidatedGoal] = useState(null) // {normalized_goal, feedback, suggested_key}
  const [file,         setFile]         = useState(null)
  const [dragging,     setDragging]     = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [validating,   setValidating]   = useState(false)
  const [demoLoading,  setDemoLoading]  = useState(false)
  const [error,        setError]        = useState(null)

  const isCustomGoal = goalKey === 'custom'
  const effectiveGoal = isCustomGoal
    ? (validatedGoal?.suggested_key || 'custom')
    : goalKey
  const canSubmit = storeName && category && goalKey &&
    (!isCustomGoal || customGoal.trim()) && file

  function handleDrop(e) {
    e.preventDefault(); setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith('.csv')) setFile(dropped)
  }

  async function handleValidateGoal() {
    if (!customGoal.trim()) return
    setValidating(true)
    try {
      const res = await validateGoal(customGoal, category)
      setValidatedGoal(res)
    } catch {
      setValidatedGoal({ normalized_goal: customGoal, feedback: 'Goal saved.', suggested_key: 'custom' })
    } finally {
      setValidating(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true); setError(null)
    try {
      const res = await uploadCSV(file, storeName, effectiveGoal, category,
                                  isCustomGoal ? customGoal : null)
      track('csv_uploaded', { store_id: res.store_id, row_count: res.rows_processed })
      saveStoreData(res)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDemo() {
    setDemoLoading(true); setError(null)
    try {
      const res = await loadDemo()
      track('demo_loaded')
      saveStoreData(res)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setDemoLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0e0f11', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 520 }}>

        {/* Header */}
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f1f1f1', marginBottom: 6, letterSpacing: '-0.5px' }}>
          <span style={{ color: '#00d97e' }}>Datawise</span>
        </h1>
        <p style={{ color: '#6b7280', marginBottom: 36, fontSize: 15 }}>
          Tell us about your store and we'll build your analytics.
        </p>

        <form onSubmit={handleSubmit}>

          {/* ── Store name ── */}
          <Section label="Store name">
            <input
              type="text"
              placeholder="e.g. Bloom Apparel"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
              required
              style={inputStyle}
            />
          </Section>

          {/* ── Category ── */}
          <Section label="What do you sell?">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  style={chipStyle(category === c.value)}
                >
                  <span>{c.icon}</span> {c.label}
                </button>
              ))}
            </div>
          </Section>

          {/* ── Goal ── */}
          <Section label="Primary goal">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PRESET_GOALS.map(g => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => { setGoalKey(g.value); setValidatedGoal(null) }}
                  style={chipStyle(goalKey === g.value)}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {isCustomGoal && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="e.g. Get 500 repeat customers by Q3"
                    value={customGoal}
                    onChange={e => { setCustomGoal(e.target.value); setValidatedGoal(null) }}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={handleValidateGoal}
                    disabled={validating || !customGoal.trim()}
                    style={{
                      padding: '0 16px', borderRadius: 8, border: '1px solid #2e2f33',
                      background: '#1e2023', color: '#9ca3af', fontSize: 13,
                      cursor: validating || !customGoal.trim() ? 'not-allowed' : 'pointer',
                      fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
                    }}
                  >
                    {validating ? '…' : 'Validate ✦'}
                  </button>
                </div>
                {validatedGoal && (
                  <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(0,217,126,0.07)', border: '1px solid rgba(0,217,126,0.2)' }}>
                    <p style={{ fontSize: 12, color: '#00d97e', fontWeight: 600, marginBottom: 2 }}>
                      ✓ Normalized: "{validatedGoal.normalized_goal}"
                    </p>
                    <p style={{ fontSize: 12, color: '#6b7280' }}>{validatedGoal.feedback}</p>
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* ── CSV Upload ── */}
          <Section label="Orders CSV">
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? '#00d97e' : file ? '#00d97e' : '#2e2f33'}`,
                borderRadius: 12, padding: '28px 24px', textAlign: 'center',
                cursor: 'pointer', background: dragging ? 'rgba(0,217,126,0.05)' : '#161719',
                transition: 'all 0.15s',
              }}
            >
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
                onChange={e => setFile(e.target.files[0])} />
              {file
                ? <p style={{ color: '#00d97e', fontSize: 14, fontWeight: 500 }}>✓ {file.name}</p>
                : <>
                    <p style={{ color: '#f1f1f1', fontSize: 14, marginBottom: 4 }}>Drop your CSV or click to browse</p>
                    <p style={{ color: '#6b7280', fontSize: 12 }}>Needs: order_id, email, order_date, total</p>
                  </>
              }
            </div>
          </Section>

          {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 16 }}>{error}</p>}

          <button
            type="submit"
            disabled={loading || !canSubmit}
            style={{
              width: '100%', padding: '14px', borderRadius: 10, border: 'none',
              background: '#00d97e', color: '#0e0f11', fontSize: 15, fontWeight: 700,
              cursor: loading || !canSubmit ? 'not-allowed' : 'pointer',
              opacity: loading || !canSubmit ? 0.5 : 1,
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {loading ? 'Uploading…' : 'Analyse my store →'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 0' }}>
          <div style={{ flex: 1, height: 1, background: '#2e2f33' }} />
          <span style={{ color: '#4b5563', fontSize: 12 }}>or</span>
          <div style={{ flex: 1, height: 1, background: '#2e2f33' }} />
        </div>

        <button
          onClick={handleDemo}
          disabled={demoLoading}
          style={{
            width: '100%', marginTop: 16, padding: '13px', borderRadius: 10,
            border: '1px solid #2e2f33', background: 'transparent',
            color: demoLoading ? '#4b5563' : '#9ca3af',
            fontSize: 14, fontWeight: 500,
            cursor: demoLoading ? 'not-allowed' : 'pointer',
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          {demoLoading ? 'Loading sample data…' : 'Try with sample data →'}
        </button>
      </div>
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <label style={{ display: 'block', fontSize: 13, color: '#9ca3af', fontWeight: 500, marginBottom: 10 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function chipStyle(active) {
  return {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
    border: active ? '1px solid #00d97e' : '1px solid #2e2f33',
    background: active ? 'rgba(0,217,126,0.1)' : '#161719',
    color: active ? '#00d97e' : '#9ca3af',
    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
    transition: 'all 0.12s',
  }
}

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 8,
  border: '1px solid #2e2f33', background: '#161719',
  color: '#f1f1f1', fontSize: 14, fontFamily: 'DM Sans, sans-serif',
  outline: 'none', boxSizing: 'border-box',
}
