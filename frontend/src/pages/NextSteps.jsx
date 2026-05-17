import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAnalysis } from '../lib/api'
import { track } from '../lib/posthog'

const GOAL_LABELS = {
  grow_repeat_rate: 'Grow repeat rate',
  increase_aov: 'Increase AOV',
  reduce_churn: 'Reduce churn',
  grow_revenue: 'Grow revenue',
}

const GOAL_PLACEHOLDERS = {
  grow_repeat_rate: 'e.g. We just launched a loyalty app and want to tie it in…',
  increase_aov: 'e.g. We have a new bundle feature launching next month…',
  reduce_churn: 'e.g. We suspect pricing is the main churn driver…',
  grow_revenue: 'e.g. We have a £2k ad budget, want to focus on paid…',
}

function getExperiments() {
  try { return JSON.parse(localStorage.getItem('experiments') || '[]') } catch { return [] }
}
function saveExperiments(exps) {
  localStorage.setItem('experiments', JSON.stringify(exps))
}

export default function NextSteps() {
  const navigate = useNavigate()
  const storeData = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('store_data') || 'null') } catch { return null }
  }, [])

  const goal      = storeData?.store?.goal || localStorage.getItem('store_goal') || 'grow_revenue'
  const storeName = storeData?.store?.name || localStorage.getItem('store_name') || 'My Store'

  const [userContext, setUserContext] = useState('')
  const [steps, setSteps]             = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [started, setStarted]         = useState({})

  async function generate(ctx) {
    if (!storeData) return
    setLoading(true); setError(null)
    try {
      const data = await getAnalysis(storeData, ctx)
      setSteps(data.steps)
      setHasGenerated(true)
      track('next_steps_generated', { store_id: storeData.store_id, has_context: !!ctx })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (storeData && !hasGenerated) generate('') }, [storeData])

  function handleStartExperiment(step) {
    const exps = getExperiments()
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()
    exps.push({
      id, insight: step, plan: null,
      status: 'not_started', steps_done: [],
      checkins: [], created_at: new Date().toISOString(), started_at: null,
    })
    saveExperiments(exps)
    setStarted(prev => ({ ...prev, [step.step]: true }))
    setTimeout(() => navigate('/experiments'), 600)
  }

  if (!storeData) return (
    <div style={center}>
      <p style={{ color: '#6b7280' }}>No data found. <a href="/upload" style={{ color: '#00d97e' }}>Upload first.</a></p>
    </div>
  )

  return (
    <div style={{ flex: 1, padding: '28px 32px', maxWidth: 740 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f1f1f1', marginBottom: 6 }}>AI Next Steps</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{storeName}</span>
          <span style={{ color: '#2e2f33' }}>·</span>
          <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', padding: '2px 8px', borderRadius: 20 }}>
            {GOAL_LABELS[goal] || goal}
          </span>
        </div>
      </div>

      {/* Context input */}
      <div style={{ background: '#161719', borderRadius: 12, padding: '20px 24px', marginBottom: 24, border: '1px solid #1e2023' }}>
        <label style={{ display: 'block', fontSize: 13, color: '#9ca3af', fontWeight: 500, marginBottom: 10 }}>
          Add context to personalise insights <span style={{ color: '#4b5563' }}>(optional)</span>
        </label>
        <textarea
          value={userContext}
          onChange={e => setUserContext(e.target.value)}
          placeholder={GOAL_PLACEHOLDERS[goal] || 'Any constraints, upcoming launches, or focus areas…'}
          rows={3}
          style={{
            width: '100%', padding: '11px 14px', borderRadius: 8,
            border: '1px solid #2e2f33', background: '#0e0f11',
            color: '#f1f1f1', fontSize: 13, fontFamily: 'DM Sans, sans-serif',
            outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6,
          }}
          onFocus={e => e.target.style.borderColor = '#00d97e'}
          onBlur={e => e.target.style.borderColor = '#2e2f33'}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            onClick={() => generate(userContext)}
            disabled={loading}
            style={{
              padding: '9px 20px', borderRadius: 8, border: 'none',
              background: loading ? '#1e2023' : '#00d97e',
              color: loading ? '#6b7280' : '#0e0f11',
              fontSize: 13, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {loading ? 'Generating…' : hasGenerated ? 'Regenerate' : 'Generate insights'}
          </button>
        </div>
      </div>

      {error && <p style={{ color: '#f87171', fontSize: 14, marginBottom: 16 }}>{error}</p>}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 4 }}>Analysing your data…</p>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 160, background: '#161719', borderRadius: 12, border: '1px solid #1e2023', opacity: 0.4 + i * 0.15 }} />
          ))}
        </div>
      )}

      {!loading && steps && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {steps.map((step, i) => (
            <div key={i} style={{ background: '#161719', borderRadius: 12, padding: '24px', border: '1px solid #1e2023' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,217,126,0.12)', color: '#00d97e', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {step.step}
                </span>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f1f1f1', marginBottom: 10 }}>{step.action}</h3>
                  <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6, marginBottom: 14 }}>{step.reasoning}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-block', padding: '5px 12px', borderRadius: 6, background: 'rgba(0,217,126,0.1)', color: '#00d97e', fontSize: 12, fontWeight: 600 }}>
                      Est. impact: {step.estimated_impact}
                    </span>
                    <button
                      onClick={() => handleStartExperiment(step)}
                      disabled={started[step.step]}
                      style={{
                        padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        border: '1px solid #2e2f33', background: started[step.step] ? '#1e2023' : 'transparent',
                        color: started[step.step] ? '#00d97e' : '#9ca3af',
                        cursor: started[step.step] ? 'default' : 'pointer',
                        fontFamily: 'DM Sans, sans-serif',
                      }}
                    >
                      {started[step.step] ? '✓ Added to experiments' : '⚗ Run as experiment'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes fadeIn { to { opacity: 1 } }`}</style>
    </div>
  )
}

const center = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }
