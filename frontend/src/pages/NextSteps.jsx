import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAnalysis } from '../lib/api'
import { track } from '../lib/posthog'

const GOAL_LABELS = {
  grow_repeat_rate: 'Grow repeat rate',
  increase_aov:     'Increase AOV',
  reduce_churn:     'Reduce churn',
  grow_revenue:     'Grow total orders',
  grow_total_orders:'Grow total orders',
}
const IMPACT_COLOR = ['#00d97e', '#fbbf24', '#a78bfa']
const IMPACT_LABEL = ['High impact', 'Medium impact', 'Quick win']

function getExperiments() { try { return JSON.parse(localStorage.getItem('experiments') || '[]') } catch { return [] } }
function saveExperiments(e) { localStorage.setItem('experiments', JSON.stringify(e)) }

function SkeletonCard({ dim }) {
  return (
    <div style={{ background: '#161719', borderRadius: 14, padding: 24, border: '1px solid #1e2023', opacity: dim ? 0.5 : 0.75 }}>
      <div style={{ height: 10, width: '25%', background: '#1e2023', borderRadius: 6, marginBottom: 14 }} />
      <div style={{ height: 18, width: '70%', background: '#1e2023', borderRadius: 6, marginBottom: 12 }} />
      <div style={{ height: 12, width: '95%', background: '#1e2023', borderRadius: 6, marginBottom: 6 }} />
      <div style={{ height: 12, width: '65%', background: '#1e2023', borderRadius: 6, marginBottom: 20 }} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ height: 30, width: 110, background: '#1e2023', borderRadius: 8 }} />
        <div style={{ height: 30, width: 140, background: '#1e2023', borderRadius: 8 }} />
      </div>
    </div>
  )
}

export default function NextSteps() {
  const navigate  = useNavigate()
  const storeData = useMemo(() => { try { return JSON.parse(localStorage.getItem('store_data') || 'null') } catch { return null } }, [])
  const pmData    = useMemo(() => { try { return JSON.parse(localStorage.getItem('pm_data') || 'null') } catch { return null } }, [])

  const goal      = storeData?.store?.goal || localStorage.getItem('store_goal') || 'grow_revenue'
  const storeName = storeData?.store?.name || localStorage.getItem('store_name') || 'My Store'

  const [userContext,    setUserContext]    = useState('')
  const [steps,          setSteps]          = useState(null)
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState(null)
  const [hasGenerated,   setHasGenerated]   = useState(false)
  const [started,        setStarted]        = useState({})
  const [contextOpen,    setContextOpen]    = useState(false)

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
    exps.push({ id, insight: step, plan: null, status: 'not_started', steps_done: [], checkins: [], daily_logs: [], created_at: new Date().toISOString(), started_at: null })
    saveExperiments(exps)
    setStarted(prev => ({ ...prev, [step.step]: true }))
    setTimeout(() => navigate('/experiments'), 600)
  }

  if (!storeData) return (
    <div style={center}><p style={{ color: '#6b7280' }}>No data found. <a href="/upload" style={{ color: '#00d97e' }}>Upload first.</a></p></div>
  )

  return (
    <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto', maxWidth: 780 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f1f1f1', letterSpacing: '-0.5px', marginBottom: 6 }}>AI Next Steps</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>{storeName}</span>
            <span style={{ color: '#2e2f33' }}>·</span>
            <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', padding: '2px 8px', borderRadius: 20 }}>{GOAL_LABELS[goal] || goal}</span>
          </div>
        </div>
        <button onClick={() => generate(userContext)} disabled={loading} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #2e2f33', background: 'transparent', color: loading ? '#4b5563' : '#9ca3af', fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', flexShrink: 0 }}>
          {loading ? 'Generating…' : '↻ Regenerate'}
        </button>
      </div>

      {/* North star context strip */}
      {pmData?.north_star && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1px auto 1fr', gap: 20, alignItems: 'center', background: '#161719', border: '1px solid #1e2023', borderRadius: 12, padding: '14px 20px', marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>North star</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: '#00d97e', letterSpacing: '-0.5px' }}>
              {pmData.north_star.unit === '$' ? `$${pmData.north_star.current}` : `${pmData.north_star.current}${pmData.north_star.unit}`}
            </p>
            <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{pmData.north_star.label}</p>
          </div>
          <div style={{ height: 40, background: '#1e2023' }} />
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Gap to target</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#fbbf24' }}>{pmData.north_star.gap_text}</p>
            <p style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>Target: {pmData.north_star.unit === '$' ? `$${pmData.north_star.target}` : `${pmData.north_star.target}${pmData.north_star.unit}`}</p>
          </div>
          {pmData.persona_insight && (
            <>
              <div style={{ height: 40, background: '#1e2023', width: 1 }} />
              <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.65, gridColumn: '4' }}>{pmData.persona_insight}</p>
            </>
          )}
        </div>
      )}

      {/* Context toggle */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setContextOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#4b5563', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', padding: 0 }}>
          <span style={{ fontSize: 10 }}>{contextOpen ? '▾' : '▸'}</span> Add context to personalise
        </button>
        {contextOpen && (
          <div style={{ marginTop: 10, background: '#161719', border: '1px solid #1e2023', borderRadius: 12, padding: 16 }}>
            <textarea value={userContext} onChange={e => setUserContext(e.target.value)} placeholder="e.g. Launching a loyalty app next month, want to tie it in…" rows={2} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #2e2f33', background: '#0e0f11', color: '#f1f1f1', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none', resize: 'none', boxSizing: 'border-box', lineHeight: 1.6 }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={() => { generate(userContext); setContextOpen(false) }} disabled={loading} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#00d97e', color: '#0e0f11', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Apply →</button>
            </div>
          </div>
        )}
      </div>

      {error && <p style={{ color: '#f87171', fontSize: 14, marginBottom: 16 }}>{error}</p>}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ color: '#4b5563', fontSize: 13, marginBottom: 4 }}>Analysing your data…</p>
          <SkeletonCard />
          <SkeletonCard dim />
          <SkeletonCard dim />
          <style>{`@keyframes shimmer{0%{opacity:.4}50%{opacity:.75}100%{opacity:.4}}.sk{animation:shimmer 1.6s ease-in-out infinite}`}</style>
        </div>
      )}

      {!loading && steps && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {steps.map((step, i) => {
            const col   = IMPACT_COLOR[i] || '#6b7280'
            const label = IMPACT_LABEL[i] || ''
            const done  = started[step.step]
            return (
              <div key={i} style={{ background: '#161719', borderRadius: 14, border: '1px solid #1e2023', overflow: 'hidden', borderLeft: `3px solid ${col}` }}>
                {i === 0 && (
                  <div style={{ background: `${col}08`, borderBottom: '1px solid rgba(0,217,126,0.12)', padding: '6px 22px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: col, textTransform: 'uppercase', letterSpacing: '0.1em' }}>⚡ Top priority action</span>
                  </div>
                )}
                <div style={{ padding: '20px 22px' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: `${col}15`, color: col, fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {step.step}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f1f1f1' }}>{step.action}</h3>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: `${col}15`, color: col }}>{label}</span>
                      </div>
                      <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.7, marginBottom: 16 }}>{step.reasoning}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, background: 'rgba(0,217,126,0.08)', color: '#00d97e', fontSize: 12, fontWeight: 600 }}>
                          📈 {step.estimated_impact}
                        </span>
                        <button
                          onClick={() => handleStartExperiment(step)}
                          disabled={done}
                          style={{ padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: done ? '1px solid rgba(0,217,126,0.3)' : '1px solid #2e2f33', background: done ? 'rgba(0,217,126,0.08)' : 'transparent', color: done ? '#00d97e' : '#9ca3af', cursor: done ? 'default' : 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'all .15s' }}
                        >
                          {done ? '✓ Added to experiments' : '⚗ Run as experiment'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const center = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }
