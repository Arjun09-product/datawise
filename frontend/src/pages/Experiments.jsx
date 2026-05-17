import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getExperimentPlan, checkExperiment } from '../lib/api'

function getExps() { try { return JSON.parse(localStorage.getItem('experiments') || '[]') } catch { return [] } }
function saveExps(e) { localStorage.setItem('experiments', JSON.stringify(e)) }
function getStoreData() { try { return JSON.parse(localStorage.getItem('store_data') || 'null') } catch { return null } }

const STATUS_COLORS = { not_started: '#6b7280', in_progress: '#fbbf24', completed: '#00d97e', paused: '#f87171' }
const STATUS_LABELS = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', paused: 'Paused' }

export default function Experiments() {
  const navigate = useNavigate()
  const storeData = useMemo(getStoreData, [])
  const [experiments, setExperiments] = useState(getExps)
  const [loadingPlan, setLoadingPlan] = useState({})
  const [checkinText, setCheckinText] = useState({})
  const [checkinLoading, setCheckinLoading] = useState({})
  const [checkinOpen, setCheckinOpen] = useState({})

  function update(id, patch) {
    setExperiments(prev => {
      const next = prev.map(e => e.id === id ? { ...e, ...patch } : e)
      saveExps(next)
      return next
    })
  }

  async function loadPlan(exp) {
    if (exp.plan || loadingPlan[exp.id]) return
    setLoadingPlan(p => ({ ...p, [exp.id]: true }))
    try {
      const plan = await getExperimentPlan(exp.insight, storeData)
      update(exp.id, { plan, status: 'in_progress', started_at: new Date().toISOString(), steps_done: [] })
    } catch {
      update(exp.id, { plan: { hypothesis: `Test: ${exp.insight.action}`, steps: ['Plan', 'Execute', 'Measure'], success_metric: exp.insight.estimated_impact, duration_days: 14, check_in_days: 3 }, status: 'in_progress', started_at: new Date().toISOString(), steps_done: [] })
    } finally {
      setLoadingPlan(p => ({ ...p, [exp.id]: false }))
    }
  }

  function toggleStep(exp, idx) {
    const done = exp.steps_done || []
    const next = done.includes(idx) ? done.filter(i => i !== idx) : [...done, idx]
    const allDone = exp.plan?.steps && next.length === exp.plan.steps.length
    update(exp.id, { steps_done: next, status: allDone ? 'completed' : 'in_progress' })
  }

  async function handleCheckin(exp) {
    const note = (checkinText[exp.id] || '').trim()
    if (!note) return
    setCheckinLoading(p => ({ ...p, [exp.id]: true }))
    try {
      const res = await checkExperiment(exp, note)
      const entry = { note, ai: res.recommendation, encouragement: res.encouragement, ts: new Date().toISOString() }
      update(exp.id, { checkins: [...(exp.checkins || []), entry] })
      setCheckinText(p => ({ ...p, [exp.id]: '' }))
    } catch {
      const entry = { note, ai: 'Keep going — every step counts!', ts: new Date().toISOString() }
      update(exp.id, { checkins: [...(exp.checkins || []), entry] })
      setCheckinText(p => ({ ...p, [exp.id]: '' }))
    } finally {
      setCheckinLoading(p => ({ ...p, [exp.id]: false }))
    }
  }

  function removeExp(id) {
    setExperiments(prev => { const next = prev.filter(e => e.id !== id); saveExps(next); return next })
  }

  const active   = experiments.filter(e => e.status !== 'completed')
  const done     = experiments.filter(e => e.status === 'completed')

  return (
    <div style={{ flex: 1, padding: '28px 32px', maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f1f1f1', marginBottom: 4 }}>⚗ Experiments</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Turn insights into tracked tests. AI coaches you through each one.</p>
        </div>
        <button
          onClick={() => navigate('/next-steps')}
          style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #2e2f33', background: 'transparent', color: '#9ca3af', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
        >
          + New from insights
        </button>
      </div>

      {experiments.length === 0 && (
        <div style={{ background: '#161719', borderRadius: 12, padding: '56px 24px', textAlign: 'center', border: '1px solid #1e2023' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>⚗</p>
          <p style={{ color: '#f1f1f1', fontWeight: 600, marginBottom: 8 }}>No experiments yet</p>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>Go to Next Steps and click "Run as experiment" on any insight.</p>
          <button onClick={() => navigate('/next-steps')} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#00d97e', color: '#0e0f11', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            Browse insights →
          </button>
        </div>
      )}

      {active.length > 0 && (
        <>
          <SectionLabel>{active.length} Active</SectionLabel>
          {active.map(exp => (
            <ExperimentCard key={exp.id} exp={exp}
              loadingPlan={loadingPlan[exp.id]}
              checkinText={checkinText[exp.id] || ''}
              checkinLoading={checkinLoading[exp.id]}
              checkinOpen={checkinOpen[exp.id]}
              onStart={() => loadPlan(exp)}
              onToggleStep={idx => toggleStep(exp, idx)}
              onCheckinTextChange={v => setCheckinText(p => ({ ...p, [exp.id]: v }))}
              onCheckin={() => handleCheckin(exp)}
              onToggleCheckin={() => setCheckinOpen(p => ({ ...p, [exp.id]: !p[exp.id] }))}
              onRemove={() => removeExp(exp.id)}
              onStatusChange={s => update(exp.id, { status: s })}
            />
          ))}
        </>
      )}

      {done.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 28 }}>{done.length} Completed</SectionLabel>
          {done.map(exp => (
            <ExperimentCard key={exp.id} exp={exp}
              loadingPlan={false} checkinText="" checkinLoading={false} checkinOpen={false}
              onStart={() => {}} onToggleStep={() => {}} onCheckinTextChange={() => {}}
              onCheckin={() => {}} onToggleCheckin={() => {}} onRemove={() => removeExp(exp.id)}
              onStatusChange={s => update(exp.id, { status: s })}
            />
          ))}
        </>
      )}
    </div>
  )
}

function SectionLabel({ children, style = {} }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, ...style }}>
      {children}
    </p>
  )
}

function ExperimentCard({ exp, loadingPlan, checkinText, checkinLoading, checkinOpen, onStart, onToggleStep, onCheckinTextChange, onCheckin, onToggleCheckin, onRemove, onStatusChange }) {
  const plan = exp.plan
  const statusColor = STATUS_COLORS[exp.status] || '#6b7280'
  const daysSince = exp.started_at ? Math.floor((Date.now() - new Date(exp.started_at)) / 86400000) : null
  const dueIn = plan ? Math.max(0, (plan.duration_days || 14) - (daysSince || 0)) : null

  return (
    <div style={{ background: '#161719', borderRadius: 12, padding: '20px 24px', marginBottom: 16, border: '1px solid #1e2023' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: `${statusColor}18`, color: statusColor }}>
              {STATUS_LABELS[exp.status]}
            </span>
            {daysSince !== null && (
              <span style={{ fontSize: 11, color: '#4b5563' }}>Day {daysSince + 1}{dueIn !== null ? ` · ${dueIn}d left` : ''}</span>
            )}
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f1f1f1', lineHeight: 1.4 }}>{exp.insight.action}</h3>
          {exp.insight.estimated_impact && (
            <span style={{ display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'rgba(0,217,126,0.08)', color: '#00d97e' }}>
              {exp.insight.estimated_impact}
            </span>
          )}
        </div>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 16, padding: 4, lineHeight: 1 }}>×</button>
      </div>

      {/* Not started — show start button */}
      {exp.status === 'not_started' && !plan && (
        <button
          onClick={onStart}
          disabled={loadingPlan}
          style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#00d97e', color: '#0e0f11', fontSize: 13, fontWeight: 700, cursor: loadingPlan ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}
        >
          {loadingPlan ? 'Building plan…' : 'Start this experiment →'}
        </button>
      )}

      {/* Plan loaded */}
      {plan && (
        <>
          {/* Hypothesis */}
          <div style={{ background: '#0e0f11', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hypothesis</p>
            <p style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.5 }}>{plan.hypothesis}</p>
          </div>

          {/* Steps */}
          <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Steps</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {plan.steps.map((step, idx) => {
              const done = (exp.steps_done || []).includes(idx)
              return (
                <label key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: exp.status === 'completed' ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={done} onChange={() => exp.status !== 'completed' && onToggleStep(idx)}
                    style={{ marginTop: 2, accentColor: '#00d97e', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: done ? '#4b5563' : '#d1d5db', textDecoration: done ? 'line-through' : 'none', lineHeight: 1.5 }}>
                    {step}
                  </span>
                </label>
              )
            })}
          </div>

          {/* Success metric */}
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>
            <span style={{ color: '#4b5563' }}>Success metric:</span> {plan.success_metric}
          </p>

          {/* Status controls */}
          {exp.status !== 'completed' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {exp.status === 'in_progress' && (
                <button onClick={() => onStatusChange('completed')} style={smallBtn('#00d97e')}>Mark complete ✓</button>
              )}
              <button onClick={() => onStatusChange(exp.status === 'paused' ? 'in_progress' : 'paused')} style={smallBtn('#fbbf24')}>
                {exp.status === 'paused' ? 'Resume' : 'Pause'}
              </button>
            </div>
          )}

          {/* Check-in section */}
          {exp.status !== 'completed' && (
            <div>
              <button onClick={onToggleCheckin} style={{ background: 'none', border: '1px solid #2e2f33', borderRadius: 8, color: '#9ca3af', fontSize: 13, padding: '7px 14px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {checkinOpen ? 'Close check-in' : '💬 How\'s it going?'}
              </button>

              {checkinOpen && (
                <div style={{ marginTop: 12 }}>
                  <textarea
                    value={checkinText}
                    onChange={e => onCheckinTextChange(e.target.value)}
                    placeholder="Share your progress, blockers, or results so far…"
                    rows={3}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #2e2f33', background: '#0e0f11', color: '#f1f1f1', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }}
                  />
                  <button
                    onClick={onCheckin}
                    disabled={checkinLoading || !checkinText.trim()}
                    style={{ marginTop: 8, padding: '8px 18px', borderRadius: 8, border: 'none', background: checkinLoading || !checkinText.trim() ? '#1e2023' : '#00d97e', color: checkinLoading || !checkinText.trim() ? '#4b5563' : '#0e0f11', fontSize: 13, fontWeight: 700, cursor: checkinLoading || !checkinText.trim() ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                  >
                    {checkinLoading ? 'Getting advice…' : 'Submit →'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Check-in history */}
          {exp.checkins?.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Check-in history</p>
              {[...exp.checkins].reverse().map((c, i) => (
                <div key={i} style={{ background: '#0e0f11', borderRadius: 8, padding: '12px 14px' }}>
                  <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{new Date(c.ts).toLocaleDateString()} — <span style={{ color: '#9ca3af' }}>{c.note}</span></p>
                  {c.encouragement && <p style={{ fontSize: 12, color: '#fbbf24', marginBottom: 4, fontWeight: 500 }}>{c.encouragement}</p>}
                  <p style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6, borderLeft: '2px solid #00d97e', paddingLeft: 10 }}>{c.ai}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function smallBtn(color) {
  return {
    padding: '6px 14px', borderRadius: 8, border: `1px solid ${color}30`,
    background: `${color}10`, color, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
  }
}
