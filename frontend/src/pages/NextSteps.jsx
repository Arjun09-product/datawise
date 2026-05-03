import { useEffect, useState } from 'react'
import { getAnalysis } from '../lib/api'
import { track } from '../lib/posthog'

export default function NextSteps() {
  const storeId = localStorage.getItem('store_id')
  const [steps, setSteps] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function load() {
    if (!storeId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    getAnalysis(storeId)
      .then(data => {
        setSteps(data.steps)
        track('next_steps_viewed', { store_id: storeId })
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function regenerate() {
    track('next_steps_regenerated', { store_id: storeId })
    load()
  }

  if (!storeId) return (
    <div style={wrapStyle}>
      <p style={{ color: '#6b7280' }}>No store found. <a href="/upload" style={{ color: '#00d97e' }}>Upload your data first.</a></p>
    </div>
  )

  return (
    <div style={{ flex: 1, padding: '28px 32px', maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f1f1f1' }}>AI Next Steps</h2>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Personalised actions based on your store data</p>
        </div>
        <button
          onClick={regenerate}
          disabled={loading}
          style={{
            padding: '9px 18px', borderRadius: 8, border: '1px solid #2e2f33',
            background: 'transparent', color: '#9ca3af', fontSize: 13, fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif',
          }}
        >
          Regenerate analysis
        </button>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 8 }}>Analysing your store data…</p>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 160, background: '#161719', borderRadius: 12, opacity: 0.6 + i * 0.1 }} />
          ))}
        </div>
      )}

      {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

      {!loading && steps && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {steps.map((step, i) => (
            <div key={i} style={{ background: '#161719', borderRadius: 12, padding: '24px', border: '1px solid #1e2023' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{
                  width: 32, height: 32, borderRadius: 8, background: 'rgba(0,217,126,0.12)',
                  color: '#00d97e', fontSize: 15, fontWeight: 700, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {step.step}
                </span>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f1f1f1', marginBottom: 10 }}>
                    {step.action}
                  </h3>
                  <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6, marginBottom: 16 }}>
                    {step.reasoning}
                  </p>
                  <span style={{
                    display: 'inline-block', padding: '5px 12px', borderRadius: 6,
                    background: 'rgba(0,217,126,0.1)', color: '#00d97e', fontSize: 12, fontWeight: 600,
                  }}>
                    Est. impact: {step.estimated_impact}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const wrapStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }
