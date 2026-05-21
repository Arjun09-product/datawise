import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getExperimentPlan, checkExperiment, askAI } from '../lib/api'

function getExps() { try { return JSON.parse(localStorage.getItem('experiments') || '[]') } catch { return [] } }
function saveExps(e) { localStorage.setItem('experiments', JSON.stringify(e)) }
function getStoreData() { try { return JSON.parse(localStorage.getItem('store_data') || 'null') } catch { return null } }

const STATUS_COLORS = { not_started: '#6b7280', in_progress: '#fbbf24', completed: '#00d97e', paused: '#f87171' }
const STATUS_LABELS = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', paused: 'Paused' }

// ── Top metrics strip ─────────────────────────────────────────────────────────
function MetricPill({ label, value, color = '#f1f1f1' }) {
  return (
    <div style={{ background: '#161719', border: '1px solid #1e2023', borderRadius: 10, padding: '10px 16px', flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 800, color, letterSpacing: '-0.5px' }}>{value}</p>
    </div>
  )
}

function TopMetrics({ storeData }) {
  if (!storeData?.metrics) return null
  const m = storeData.metrics
  const fmt = n => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
      <MetricPill label="Revenue"     value={fmt(m.total_revenue || 0)} color="#00d97e" />
      <MetricPill label="Orders"      value={m.total_orders || 0} />
      <MetricPill label="Avg Order"   value={fmt(m.aov || 0)} />
      <MetricPill label="Repeat Rate" value={`${m.repeat_rate || 0}%`} color="#a78bfa" />
    </div>
  )
}

// ── Timeline ──────────────────────────────────────────────────────────────────
function Timeline({ startedAt, durationDays }) {
  if (!startedAt) return null
  const start = new Date(startedAt)
  const end = new Date(start.getTime() + durationDays * 86400000)
  const now = Date.now()
  const total = end - start
  const elapsed = Math.min(Math.max(now - start, 0), total)
  const pct = Math.round((elapsed / total) * 100)
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000))
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#4b5563' }}>{fmt(start)}</span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: daysLeft === 0 ? 'rgba(248,113,113,0.15)' : 'rgba(251,191,36,0.12)', color: daysLeft === 0 ? '#f87171' : '#fbbf24' }}>
          {daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
        </span>
        <span style={{ fontSize: 11, color: '#4b5563' }}>{fmt(end)}</span>
      </div>
      <div style={{ position: 'relative', height: 6, background: '#1e2023', borderRadius: 99 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: pct >= 100 ? '#00d97e' : '#fbbf24', borderRadius: 99, transition: 'width 0.5s' }} />
        <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%, -50%)', width: 12, height: 12, borderRadius: '50%', background: '#0e0f11', border: `2px solid ${pct >= 100 ? '#00d97e' : '#fbbf24'}`, boxShadow: `0 0 6px ${pct >= 100 ? '#00d97e' : '#fbbf24'}60` }} />
      </div>
    </div>
  )
}

// ── Daily tracker ─────────────────────────────────────────────────────────────
function DailyTracker({ exp, onLogDay }) {
  if (!exp.started_at || !exp.plan) return null
  const durationDays = exp.plan.duration_days || 14
  const start = new Date(exp.started_at)
  start.setHours(0, 0, 0, 0)
  const todayStr = new Date().toISOString().slice(0, 10)
  const logMap = {}
  ;(exp.daily_logs || []).forEach(l => { logMap[l.date] = l.on_track })

  const days = Array.from({ length: durationDays }, (_, i) => {
    const d = new Date(start.getTime() + i * 86400000)
    const dateStr = d.toISOString().slice(0, 10)
    return { dateStr, isPast: dateStr < todayStr, isToday: dateStr === todayStr, logged: logMap[dateStr] }
  })

  const logs = exp.daily_logs || []
  const onTrackCount = logs.filter(l => l.on_track).length

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Daily tracker</p>
        {logs.length > 0 && <span style={{ fontSize: 11, color: '#4b5563' }}>{onTrackCount}/{logs.length} on track</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {days.map(({ dateStr, isPast, isToday, logged }) => {
          if (isToday && logged === undefined && exp.status !== 'completed') {
            return (
              <div key={dateStr} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,217,126,0.12)', border: '1px dashed #00d97e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#00d97e', fontWeight: 700 }}>?</div>
                <div style={{ display: 'flex', gap: 3 }}>
                  <button onClick={() => onLogDay(dateStr, true)} style={{ width: 22, height: 16, borderRadius: 4, border: 'none', background: 'rgba(0,217,126,0.2)', color: '#00d97e', fontSize: 9, cursor: 'pointer', fontWeight: 700, padding: 0 }}>✓</button>
                  <button onClick={() => onLogDay(dateStr, false)} style={{ width: 22, height: 16, borderRadius: 4, border: 'none', background: 'rgba(248,113,113,0.2)', color: '#f87171', fontSize: 9, cursor: 'pointer', fontWeight: 700, padding: 0 }}>✗</button>
                </div>
              </div>
            )
          }
          const bg = logged === true ? 'rgba(0,217,126,0.2)' : logged === false ? 'rgba(248,113,113,0.2)' : isPast ? '#1e2023' : '#161719'
          const border = logged === true ? '1px solid rgba(0,217,126,0.4)' : logged === false ? '1px solid rgba(248,113,113,0.4)' : '1px solid #1e2023'
          const icon = logged === true ? '✓' : logged === false ? '✗' : isPast ? '–' : '·'
          const color = logged === true ? '#00d97e' : logged === false ? '#f87171' : '#4b5563'
          return (
            <div key={dateStr} title={dateStr} style={{ width: 28, height: 28, borderRadius: 8, background: bg, border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color, fontWeight: 700 }}>
              {icon}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Inline AI chat per experiment ─────────────────────────────────────────────
function ExpChat({ exp, storeData }) {
  const [open, setOpen]       = useState(false)
  const [question, setQuestion] = useState('')
  const [history, setHistory]   = useState([])
  const [asking, setAsking]     = useState(false)
  const inputRef  = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 60) }, [open])
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [history])

  const plan = exp.plan
  const daysSince = exp.started_at ? Math.floor((Date.now() - new Date(exp.started_at)) / 86400000) : 0
  const logs = exp.daily_logs || []
  const onTrack = logs.filter(l => l.on_track).length

  const QUICK = ['What should I focus on today?', 'Am I on pace to hit the goal?', 'What could go wrong?']

  async function submit(e) {
    e?.preventDefault()
    const q = question.trim()
    if (!q || asking) return
    setQuestion(''); setAsking(true)
    const ctx = plan
      ? `I'm running an experiment: "${exp.insight.action}". Hypothesis: "${plan.hypothesis}". Success target: "${plan.success_metric}". Day ${daysSince + 1} of ${plan.duration_days || 14}. On-track days: ${onTrack}/${logs.length}. My question: ${q}`
      : q
    try {
      const { answer } = await askAI(ctx, storeData)
      setHistory(p => [...p, { q, a: answer }])
    } catch {
      setHistory(p => [...p, { q, a: 'Could not reach AI right now.' }])
    } finally {
      setAsking(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: open ? 'rgba(0,217,126,0.08)' : 'none', border: `1px solid ${open ? 'rgba(0,217,126,0.3)' : '#2e2f33'}`, borderRadius: 8, color: open ? '#00d97e' : '#9ca3af', fontSize: 13, padding: '7px 14px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'all .15s' }}
      >
        <span style={{ fontSize: 11 }}>✦</span> {open ? 'Close AI chat' : 'Ask AI for help'}
      </button>

      {open && (
        <div style={{ marginTop: 10, background: '#0e0f11', border: '1px solid #1e2023', borderRadius: 12, overflow: 'hidden' }}>
          {history.length > 0 && (
            <div ref={scrollRef} style={{ maxHeight: 260, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {history.map((item, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, background: '#1e2023', color: '#d1d5db', padding: '5px 10px', borderRadius: '10px 10px 2px 10px', maxWidth: '80%', lineHeight: 1.5 }}>{item.q}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 10, color: '#00d97e', flexShrink: 0, marginTop: 3 }}>✦</span>
                    <p style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.65 }}>{item.a}</p>
                  </div>
                </div>
              ))}
              {asking && <p style={{ fontSize: 12, color: '#4b5563', paddingLeft: 17 }}>Thinking…</p>}
            </div>
          )}
          {history.length === 0 && (
            <div style={{ padding: '10px 14px' }}>
              <p style={{ fontSize: 11, color: '#4b5563', marginBottom: 8 }}>Quick questions:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {QUICK.map(s => (
                  <button key={s} onClick={() => { setQuestion(s); setTimeout(() => inputRef.current?.focus(), 30) }} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #1e2023', background: 'transparent', color: '#9ca3af', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={submit} style={{ padding: '8px 10px', borderTop: '1px solid #1e2023', display: 'flex', gap: 6 }}>
            <input
              ref={inputRef}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ask about this experiment…"
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #1e2023', background: '#161719', color: '#f1f1f1', fontSize: 12, fontFamily: 'DM Sans, sans-serif', outline: 'none' }}
            />
            <button type="submit" disabled={asking || !question.trim()} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: asking || !question.trim() ? '#1e2023' : '#00d97e', color: asking || !question.trim() ? '#4b5563' : '#0e0f11', fontSize: 12, fontWeight: 700, cursor: asking || !question.trim() ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
              →
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Experiments() {
  const navigate  = useNavigate()
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

  function handleLogDay(expId, date, onTrack) {
    setExperiments(prev => {
      const next = prev.map(e => {
        if (e.id !== expId) return e
        const logs = (e.daily_logs || []).filter(l => l.date !== date)
        return { ...e, daily_logs: [...logs, { date, on_track: onTrack }] }
      })
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
      update(exp.id, {
        plan: { hypothesis: `Test: ${exp.insight.action}`, steps: ['Plan', 'Execute', 'Measure'], success_metric: exp.insight.estimated_impact, duration_days: 14, check_in_days: 3 },
        status: 'in_progress', started_at: new Date().toISOString(), steps_done: [],
      })
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
      update(exp.id, { checkins: [...(exp.checkins || []), { note, ai: res.recommendation, encouragement: res.encouragement, ts: new Date().toISOString() }] })
      setCheckinText(p => ({ ...p, [exp.id]: '' }))
    } catch {
      update(exp.id, { checkins: [...(exp.checkins || []), { note, ai: 'Keep going — every step counts!', ts: new Date().toISOString() }] })
      setCheckinText(p => ({ ...p, [exp.id]: '' }))
    } finally {
      setCheckinLoading(p => ({ ...p, [exp.id]: false }))
    }
  }

  function removeExp(id) {
    setExperiments(prev => { const next = prev.filter(e => e.id !== id); saveExps(next); return next })
  }

  const active = experiments.filter(e => e.status !== 'completed')
  const done   = experiments.filter(e => e.status === 'completed')

  return (
    <div style={{ flex: 1, padding: '28px 32px', maxWidth: 800, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f1f1f1', marginBottom: 4 }}>⚗ Experiments</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Track your tests. Log progress daily. Ask AI if you need help.</p>
        </div>
        <button onClick={() => navigate('/next-steps')} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #2e2f33', background: 'transparent', color: '#9ca3af', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
          + New from insights
        </button>
      </div>

      {/* Top metrics */}
      <TopMetrics storeData={storeData} />

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
            <ExperimentCard key={exp.id} exp={exp} storeData={storeData}
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
              onLogDay={(date, onTrack) => handleLogDay(exp.id, date, onTrack)}
            />
          ))}
        </>
      )}

      {done.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 28 }}>{done.length} Completed</SectionLabel>
          {done.map(exp => (
            <ExperimentCard key={exp.id} exp={exp} storeData={storeData}
              loadingPlan={false} checkinText="" checkinLoading={false} checkinOpen={false}
              onStart={() => {}} onToggleStep={() => {}} onCheckinTextChange={() => {}}
              onCheckin={() => {}} onToggleCheckin={() => {}} onRemove={() => removeExp(exp.id)}
              onStatusChange={s => update(exp.id, { status: s })}
              onLogDay={() => {}}
            />
          ))}
        </>
      )}
    </div>
  )
}

function SectionLabel({ children, style = {} }) {
  return <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, ...style }}>{children}</p>
}

function ExperimentCard({ exp, storeData, loadingPlan, checkinText, checkinLoading, checkinOpen, onStart, onToggleStep, onCheckinTextChange, onCheckin, onToggleCheckin, onRemove, onStatusChange, onLogDay }) {
  const plan = exp.plan
  const statusColor = STATUS_COLORS[exp.status] || '#6b7280'
  const daysSince = exp.started_at ? Math.floor((Date.now() - new Date(exp.started_at)) / 86400000) : null
  const dueIn = plan ? Math.max(0, (plan.duration_days || 14) - (daysSince || 0)) : null

  return (
    <div style={{ background: '#161719', borderRadius: 14, padding: '20px 24px', marginBottom: 16, border: '1px solid #1e2023' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: `${statusColor}18`, color: statusColor }}>
              {STATUS_LABELS[exp.status]}
            </span>
            {daysSince !== null && <span style={{ fontSize: 11, color: '#4b5563' }}>Day {daysSince + 1}{dueIn !== null ? ` · ${dueIn}d left` : ''}</span>}
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f1f1f1', lineHeight: 1.4 }}>{exp.insight.action}</h3>
        </div>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 16, padding: 4, lineHeight: 1 }}>×</button>
      </div>

      {/* Expected result — prominent */}
      {(exp.insight.estimated_impact || plan?.success_metric) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          {exp.insight.estimated_impact && (
            <div style={{ flex: 1, background: 'rgba(0,217,126,0.07)', border: '1px solid rgba(0,217,126,0.2)', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Expected impact</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#00d97e' }}>📈 {exp.insight.estimated_impact}</p>
            </div>
          )}
          {plan?.success_metric && (
            <div style={{ flex: 1, background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Success target</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#a78bfa' }}>🎯 {plan.success_metric}</p>
            </div>
          )}
        </div>
      )}

      {/* Not started */}
      {exp.status === 'not_started' && !plan && (
        <button onClick={onStart} disabled={loadingPlan} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#00d97e', color: '#0e0f11', fontSize: 13, fontWeight: 700, cursor: loadingPlan ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
          {loadingPlan ? 'Building plan…' : 'Start this experiment →'}
        </button>
      )}

      {plan && (
        <>
          {/* Timeline */}
          <Timeline startedAt={exp.started_at} durationDays={plan.duration_days || 14} />

          {/* Daily tracker */}
          <DailyTracker exp={exp} onLogDay={onLogDay} />

          {/* Hypothesis */}
          <div style={{ background: '#0e0f11', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hypothesis</p>
            <p style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.5 }}>{plan.hypothesis}</p>
          </div>

          {/* Steps */}
          <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Steps</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {plan.steps.map((step, idx) => {
              const isDone = (exp.steps_done || []).includes(idx)
              return (
                <label key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: exp.status === 'completed' ? 'default' : 'pointer' }}>
                  <input type="checkbox" checked={isDone} onChange={() => exp.status !== 'completed' && onToggleStep(idx)} style={{ marginTop: 2, accentColor: '#00d97e', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: isDone ? '#4b5563' : '#d1d5db', textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.5 }}>{step}</span>
                </label>
              )
            })}
          </div>

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

          {/* Check-in */}
          {exp.status !== 'completed' && (
            <div style={{ marginBottom: 4 }}>
              <button onClick={onToggleCheckin} style={{ background: 'none', border: '1px solid #2e2f33', borderRadius: 8, color: '#9ca3af', fontSize: 13, padding: '7px 14px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {checkinOpen ? 'Close check-in' : '💬 Progress check-in'}
              </button>
              {checkinOpen && (
                <div style={{ marginTop: 12 }}>
                  <textarea value={checkinText} onChange={e => onCheckinTextChange(e.target.value)} placeholder="Share your progress, blockers, or results so far…" rows={3} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #2e2f33', background: '#0e0f11', color: '#f1f1f1', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }} />
                  <button onClick={onCheckin} disabled={checkinLoading || !checkinText.trim()} style={{ marginTop: 8, padding: '8px 18px', borderRadius: 8, border: 'none', background: checkinLoading || !checkinText.trim() ? '#1e2023' : '#00d97e', color: checkinLoading || !checkinText.trim() ? '#4b5563' : '#0e0f11', fontSize: 13, fontWeight: 700, cursor: checkinLoading || !checkinText.trim() ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    {checkinLoading ? 'Getting advice…' : 'Submit →'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* AI chat */}
          <ExpChat exp={exp} storeData={storeData} />

          {/* Check-in history */}
          {exp.checkins?.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
  return { padding: '6px 14px', borderRadius: 8, border: `1px solid ${color}30`, background: `${color}10`, color, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }
}
