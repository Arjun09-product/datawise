import { useMemo, useState, useRef, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import MetricCard from '../components/MetricCard'
import { askAI } from '../lib/api'

const SEGMENT_COLORS = { repeat: '#00d97e', one_time: '#a78bfa', at_risk: '#fbbf24', churned: '#f87171' }
const CHANNEL_COLORS = { organic: '#00d97e', paid: '#a78bfa', email: '#fbbf24', direct: '#6b7280' }
const SEGMENT_LABELS = { repeat: 'Repeat buyers', one_time: 'One-time', at_risk: 'At-risk 30d+', churned: 'Churned 90d+' }
const GOAL_LABELS    = { grow_repeat_rate: 'Grow repeat rate', increase_aov: 'Increase AOV', reduce_churn: 'Reduce churn', grow_revenue: 'Grow revenue', grow_total_orders: 'Grow total orders' }
const STATUS_COLOR   = { healthy: '#00d97e', neutral: '#a78bfa', warning: '#fbbf24', critical: '#f87171', no_data: '#374151' }
const STATUS_LABEL   = { healthy: 'Healthy', neutral: 'On track', warning: 'Needs attention', critical: 'Critical', no_data: 'No data' }

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#00d97e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 7, fontWeight: 900, color: '#0e0f11', lineHeight: 1.15, letterSpacing: '0.04em', fontFamily: 'Arial Black, Arial, sans-serif' }}>DATA</span>
        <span style={{ fontSize: 7, fontWeight: 900, color: '#0e0f11', lineHeight: 1.15, letterSpacing: '0.04em', fontFamily: 'Arial Black, Arial, sans-serif' }}>WISE</span>
      </div>
      <span style={{ fontSize: 20, fontWeight: 700, color: '#00d97e', letterSpacing: '-0.5px' }}>Datawise</span>
    </div>
  )
}

function NorthStar({ ns, aiSummary }) {
  if (!ns) return null
  const col = STATUS_COLOR[ns.status] || '#6b7280'
  const pct = ns.target > 0 ? Math.min(100, Math.round((ns.current / ns.target) * 100)) : 0
  return (
    <div style={{ background: '#161719', border: `1px solid ${col}30`, borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>⭐ North Star Metric</p>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>{ns.label}</p>
          <p style={{ fontSize: 36, fontWeight: 800, color: col, letterSpacing: '-1.5px', lineHeight: 1 }}>
            {ns.unit === '$' ? `$${typeof ns.current === 'number' ? ns.current.toLocaleString() : ns.current}` : `${ns.current}${ns.unit}`}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, background: `${col}18`, color: col }}>{STATUS_LABEL[ns.status]}</span>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>{ns.gap_text}</p>
          {ns.benchmark && <p style={{ fontSize: 11, color: '#374151', marginTop: 4 }}>Median: {ns.unit === '$' ? `$${ns.benchmark}` : `${ns.benchmark}${ns.unit}`}</p>}
        </div>
      </div>
      <div style={{ background: '#0e0f11', borderRadius: 6, height: 6, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 6, transition: 'width .6s ease' }} />
      </div>
      <p style={{ fontSize: 11, color: '#374151' }}>
        {pct}% to target {ns.unit === '$' ? `$${ns.target?.toLocaleString()}` : `${ns.target}${ns.unit}`}
      </p>
      {aiSummary && <p style={{ fontSize: 13, color: '#d1d5db', marginTop: 12, paddingTop: 12, borderTop: '1px solid #1e2023', lineHeight: 1.6 }}>✦ {aiSummary}</p>}
    </div>
  )
}

function FocusAreas({ areas }) {
  if (!areas?.length) return null
  return (
    <div style={{ background: '#161719', border: '1px solid #1e2023', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
      <p style={ct}>Focus areas</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {areas.map((a, i) => (
          <div key={i} style={{ padding: '14px', borderRadius: 10, background: '#0e0f11', border: '1px solid #1e2023' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(0,217,126,0.15)', color: '#00d97e', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.rank}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f1f1' }}>{a.area}</span>
            </div>
            <p style={{ fontSize: 13, color: '#f87171', marginBottom: 6, lineHeight: 1.5 }}>⚠ {a.problem}</p>
            <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8, lineHeight: 1.5 }}>→ {a.lever}</p>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: 'rgba(0,217,126,0.1)', color: '#00d97e' }}>{a.estimated_impact}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function JourneyFunnel({ steps }) {
  if (!steps?.length) return null
  return (
    <div style={{ background: '#161719', border: '1px solid #1e2023', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
      <p style={ct}>Customer journey health</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((s, i) => {
          const col = STATUS_COLOR[s.status] || '#374151'
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderRadius: 10, background: '#0e0f11', border: `1px solid ${s.data_available ? `${col}25` : '#1e2023'}` }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${col}20`, color: col, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{s.step}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#d1d5db' }}>{s.label}</span>
                  {s.data_available
                    ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: `${col}18`, color: col }}>{STATUS_LABEL[s.status]}</span>
                    : s.status !== 'neutral' && <span style={{ fontSize: 10, color: '#374151', padding: '2px 7px', borderRadius: 20, background: '#1a1c20' }}>No data</span>
                  }
                </div>
                <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{s.insight}</p>
                {s.note && <p style={{ fontSize: 11, color: '#374151', marginTop: 3 }}>💡 {s.note}</p>}
                {s.data_available && s.current_value != null && (
                  <p style={{ fontSize: 12, fontWeight: 600, color: col, marginTop: 4 }}>
                    {s.unit === '$' ? `$${s.current_value}` : `${s.current_value}${s.unit || ''}`}
                    {s.benchmark && <span style={{ color: '#374151', fontWeight: 400 }}> · median {s.unit === '$' ? `$${s.benchmark}` : `${s.benchmark}${s.unit || ''}`}</span>}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Floating AI overlay ───────────────────────────────────────────────────────
function AskAIOverlay({ storeData, onClose }) {
  const [question, setQuestion] = useState('')
  const [history, setHistory]   = useState([])
  const [asking, setAsking]     = useState(false)
  const inputRef   = useRef(null)
  const historyRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  useEffect(() => {
    if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight
  }, [history])

  async function handleAsk(e) {
    e.preventDefault()
    if (!question.trim() || asking) return
    const q = question.trim()
    setQuestion(''); setAsking(true)
    try {
      const { answer } = await askAI(q, storeData)
      setHistory(prev => [...prev, { q, a: answer }])
    } catch {
      setHistory(prev => [...prev, { q, a: 'Could not get an answer right now.' }])
    } finally {
      setAsking(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
      {/* Panel */}
      <div style={{ position: 'fixed', bottom: 80, right: 24, width: 380, maxHeight: 480, background: '#161719', border: '1px solid #2e2f33', borderRadius: 16, zIndex: 201, boxShadow: '0 12px 48px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #1e2023', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#f1f1f1' }}>Ask AI</p>
            <p style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>Powered by your store data</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        {history.length > 0 && (
          <div ref={historyRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {history.map((item, i) => (
              <div key={i}>
                <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}><span style={{ color: '#4b5563' }}>You: </span>{item.q}</p>
                <p style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6, paddingLeft: 10, borderLeft: '2px solid #00d97e' }}>{item.a}</p>
              </div>
            ))}
            {asking && <p style={{ fontSize: 12, color: '#4b5563' }}>Thinking…</p>}
          </div>
        )}
        {history.length === 0 && !asking && (
          <div style={{ padding: '16px 18px 0' }}>
            {['What should I do next?', 'Why is my repeat rate low?', 'How can I grow AOV?'].map(s => (
              <button key={s} onClick={() => setQuestion(s)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', marginBottom: 6, borderRadius: 8, border: '1px solid #1e2023', background: '#0e0f11', color: '#9ca3af', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {s}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={handleAsk} style={{ padding: '12px 14px', borderTop: history.length > 0 ? '1px solid #1e2023' : 'none', display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="What should I do next?"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #2e2f33', background: '#0e0f11', color: '#f1f1f1', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none' }}
          />
          <button type="submit" disabled={asking || !question.trim()} style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: asking || !question.trim() ? '#1e2023' : '#00d97e', color: asking || !question.trim() ? '#4b5563' : '#0e0f11', fontSize: 13, fontWeight: 700, cursor: asking || !question.trim() ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            →
          </button>
        </form>
      </div>
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const storeName = localStorage.getItem('store_name') || 'My Store'
  const goal      = localStorage.getItem('store_goal') || ''
  const storeData = useMemo(() => { try { return JSON.parse(localStorage.getItem('store_data') || 'null') } catch { return null } }, [])
  const pmData    = useMemo(() => { try { return JSON.parse(localStorage.getItem('pm_data') || 'null') } catch { return null } }, [])
  const [aiOpen, setAiOpen] = useState(false)

  if (!storeData) return (
    <div style={centerStyle}>
      <p style={{ color: '#6b7280' }}>No data found. <a href="/upload" style={{ color: '#00d97e' }}>Upload your data first.</a></p>
    </div>
  )

  const m      = storeData.metrics || {}
  const orders = storeData.orders  || []
  const fmt    = n => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`

  const dailyRevenue = useMemo(() => {
    const byDate = {}
    for (const o of orders) {
      const d = o.order_date?.slice(0, 10)
      if (d) byDate[d] = (byDate[d] || 0) + (o.total || 0)
    }
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({ date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), revenue: Math.round(revenue) }))
  }, [orders])

  const channelRev  = m.channel_revenue || {}
  const totalChRev  = Object.values(channelRev).reduce((a, b) => a + b, 0)
  const channelData = Object.entries(channelRev).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1), raw: name,
    value: Math.round((value / (totalChRev || 1)) * 100),
  }))

  const segmentCounts = m.segments || {}
  const totalSeg      = Object.values(segmentCounts).reduce((a, b) => a + b, 0)
  const segmentData   = Object.entries(segmentCounts).map(([key, count]) => ({
    key, name: SEGMENT_LABELS[key] || key,
    pct: totalSeg > 0 ? Math.round((count / totalSeg) * 100) : 0,
    count,
  }))

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <Logo />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, paddingLeft: 2 }}>
              <span style={{ fontSize: 13, color: '#9ca3af' }}>{storeName}</span>
              {goal && <><span style={{ color: '#2e2f33' }}>·</span><span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', padding: '2px 10px', borderRadius: 20 }}>{GOAL_LABELS[goal] || goal}</span></>}
              {storeData.store?.category && <><span style={{ color: '#2e2f33' }}>·</span><span style={{ fontSize: 11, color: '#4b5563' }}>{storeData.store.category}</span></>}
            </div>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,217,126,0.15)', border: '1.5px solid #00d97e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00d97e', fontWeight: 700, fontSize: 14 }}>
            {storeName[0]}
          </div>
        </div>

        {/* 1 — Metric cards */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <MetricCard label="Revenue"     value={fmt(m.total_revenue || 0)} delta={null} />
          <MetricCard label="Orders"      value={m.total_orders || 0}        delta={null} />
          <MetricCard label="Avg Order"   value={fmt(m.aov || 0)}            delta={null} />
          <MetricCard label="Repeat Rate" value={`${m.repeat_rate || 0}%`}   delta={null} />
        </div>

        {/* 2 — Focus areas */}
        {pmData?.focus_areas?.length > 0 && <FocusAreas areas={pmData.focus_areas} />}

        {/* 3 — North star */}
        {pmData?.north_star && <NorthStar ns={pmData.north_star} aiSummary={pmData.ai_summary} />}

        {/* 4 — Journey funnel */}
        {pmData?.journey_health?.length > 0 && <JourneyFunnel steps={pmData.journey_health} />}

        {/* 5 — Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={cs}>
            <h3 style={ct}>Revenue by date</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={dailyRevenue}>
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis hide />
                <Tooltip contentStyle={{ background: '#1e2023', border: 'none', borderRadius: 8, color: '#f1f1f1', fontSize: 12 }} formatter={v => [`$${v}`, 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke="#00d97e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={cs}>
            <h3 style={ct}>Channel Mix</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={channelData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value">
                  {channelData.map(e => <Cell key={e.raw} fill={CHANNEL_COLORS[e.raw] || '#6b7280'} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e2023', border: 'none', borderRadius: 8, color: '#f1f1f1', fontSize: 12 }} formatter={(v, name) => [`${v}%`, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 10px', marginTop: 2 }}>
              {channelData.map(c => (
                <span key={c.raw} style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: CHANNEL_COLORS[c.raw] || '#6b7280', display: 'inline-block' }} />
                  {c.name} {c.value}%
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 6 — Customer segments */}
        <div style={{ ...cs, marginBottom: 32 }}>
          <h3 style={ct}>Customer Segments</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {segmentData.map(seg => (
              <div key={seg.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: SEGMENT_COLORS[seg.key] || '#6b7280', display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#d1d5db', fontWeight: 500 }}>{seg.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{seg.count} customers</span>
                    <span style={{ fontSize: 12, color: SEGMENT_COLORS[seg.key] || '#6b7280', fontFamily: 'monospace', fontWeight: 600 }}>{seg.pct}%</span>
                  </div>
                </div>
                <div style={{ background: '#1e2023', borderRadius: 4, height: 5 }}>
                  <div style={{ width: `${seg.pct}%`, height: '100%', borderRadius: 4, background: SEGMENT_COLORS[seg.key] || '#6b7280' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Floating AI button ── */}
      <button
        onClick={() => setAiOpen(o => !o)}
        style={{ position: 'fixed', bottom: 24, right: 24, width: 46, height: 46, borderRadius: '50%', background: aiOpen ? '#00b86a' : '#00d97e', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 199, boxShadow: '0 4px 20px rgba(0,217,126,0.45)', fontSize: 18, transition: 'background .15s' }}
        title="Ask AI"
      >
        {aiOpen ? '×' : '✦'}
      </button>

      {aiOpen && <AskAIOverlay storeData={storeData} onClose={() => setAiOpen(false)} />}
    </div>
  )
}

const cs = { background: '#161719', borderRadius: 12, padding: '18px 22px' }
const ct = { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }
const centerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }
