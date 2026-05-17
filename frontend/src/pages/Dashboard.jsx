import { useMemo, useState, useRef, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import MetricCard from '../components/MetricCard'
import Logo from '../components/Logo'
import { askAI } from '../lib/api'

const SEGMENT_COLORS = { repeat: '#00d97e', one_time: '#a78bfa', at_risk: '#fbbf24', churned: '#f87171' }
const CHANNEL_COLORS = { organic: '#00d97e', paid: '#a78bfa', email: '#fbbf24', direct: '#6b7280' }
const SEGMENT_LABELS  = { repeat: 'Repeat buyers', one_time: 'One-time', at_risk: 'At-risk 30d+', churned: 'Churned 90d+' }
const GOAL_LABELS     = { grow_repeat_rate: 'Grow repeat rate', increase_aov: 'Increase AOV', reduce_churn: 'Reduce churn', grow_revenue: 'Grow revenue' }

export default function Dashboard() {
  const storeName = localStorage.getItem('store_name') || 'My Store'
  const goal      = localStorage.getItem('store_goal') || ''
  const storeData = useMemo(() => { try { return JSON.parse(localStorage.getItem('store_data') || 'null') } catch { return null } }, [])

  const [question, setQuestion]   = useState('')
  const [qaHistory, setQaHistory] = useState([])
  const [asking, setAsking]       = useState(false)
  const inputRef    = useRef(null)
  const historyRef  = useRef(null)

  useEffect(() => {
    if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight
  }, [qaHistory])

  if (!storeData) return (
    <div style={centerStyle}>
      <p style={{ color: '#6b7280' }}>No data found. <a href="/upload" style={{ color: '#00d97e' }}>Upload your data first.</a></p>
    </div>
  )

  const m       = storeData.metrics || {}
  const orders  = storeData.orders  || []
  const fmt     = n => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`

  const dailyRevenue = useMemo(() => {
    const byDate = {}
    for (const o of orders) {
      const d = o.order_date?.slice(0, 10)
      if (d) byDate[d] = (byDate[d] || 0) + (o.total || 0)
    }
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: Math.round(revenue),
      }))
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
  }))

  async function handleAsk(e) {
    e.preventDefault()
    if (!question.trim() || asking) return
    const q = question.trim()
    setQuestion(''); setAsking(true)
    try {
      const { answer } = await askAI(q, storeData)
      setQaHistory(prev => [...prev, { q, a: answer }])
    } catch {
      setQaHistory(prev => [...prev, { q, a: 'Could not get an answer right now.' }])
    } finally {
      setAsking(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* ── Scrollable content area ── */}
      <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>

        {/* Logo + store info */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <Logo />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, paddingLeft: 2 }}>
              <span style={{ fontSize: 13, color: '#9ca3af' }}>{storeName}</span>
              {goal && <>
                <span style={{ color: '#2e2f33' }}>·</span>
                <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', padding: '2px 10px', borderRadius: 20 }}>
                  {GOAL_LABELS[goal] || goal}
                </span>
              </>}
              {storeData.store?.category && (
                <>
                  <span style={{ color: '#2e2f33' }}>·</span>
                  <span style={{ fontSize: 11, color: '#4b5563' }}>{storeData.store.category}</span>
                </>
              )}
            </div>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,217,126,0.15)', border: '1.5px solid #00d97e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00d97e', fontWeight: 700, fontSize: 14 }}>
            {storeName[0]}
          </div>
        </div>

        {/* Metric cards */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
          <MetricCard label="Revenue"     value={fmt(m.total_revenue || 0)} delta={null} />
          <MetricCard label="Orders"      value={m.total_orders || 0}        delta={null} />
          <MetricCard label="Avg Order"   value={fmt(m.aov || 0)}            delta={null} />
          <MetricCard label="Repeat Rate" value={`${m.repeat_rate || 0}%`}   delta={null} />
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 28 }}>
          <div style={card}>
            <h3 style={cardTitle}>Revenue by date</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={dailyRevenue}>
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis hide />
                <Tooltip contentStyle={{ background: '#1e2023', border: 'none', borderRadius: 8, color: '#f1f1f1', fontSize: 12 }} formatter={v => [`$${v}`, 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke="#00d97e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={card}>
            <h3 style={cardTitle}>Channel Mix</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={channelData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {channelData.map(e => <Cell key={e.raw} fill={CHANNEL_COLORS[e.raw] || '#6b7280'} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e2023', border: 'none', borderRadius: 8, color: '#f1f1f1', fontSize: 12 }} formatter={(v, name) => [`${v}%`, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 4 }}>
              {channelData.map(c => (
                <span key={c.raw} style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: CHANNEL_COLORS[c.raw] || '#6b7280', display: 'inline-block' }} />
                  {c.name} {c.value}%
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Segment bars */}
        <div style={{ ...card, marginBottom: 28 }}>
          <h3 style={cardTitle}>Customer Segments</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
            {segmentData.map(seg => (
              <div key={seg.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 13, color: '#d1d5db', fontWeight: 500 }}>{seg.name}</span>
                  <span style={{ fontSize: 12, color: SEGMENT_COLORS[seg.key] || '#6b7280', fontFamily: 'monospace' }}>{seg.pct}%</span>
                </div>
                <div style={{ background: '#1e2023', borderRadius: 4, height: 6 }}>
                  <div style={{ width: `${seg.pct}%`, height: '100%', borderRadius: 4, background: SEGMENT_COLORS[seg.key] || '#6b7280' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── Ask AI — fixed at bottom ── */}
      <div style={{ background: '#0e0f11', borderTop: '1px solid #1e2023', padding: '14px 32px 18px', flexShrink: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Ask AI about your store
        </p>

        {qaHistory.length > 0 && (
          <div
            ref={historyRef}
            style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {qaHistory.map((qa, i) => (
              <div key={i}>
                <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>
                  <span style={{ color: '#4b5563' }}>You: </span>{qa.q}
                </p>
                <p style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.6, paddingLeft: 10, borderLeft: '2px solid #00d97e' }}>
                  {qa.a}
                </p>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAsk} style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="e.g. Why is my repeat rate low? What should I focus on first?"
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 8,
              border: '1px solid #2e2f33', background: '#161719',
              color: '#f1f1f1', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = '#00d97e'}
            onBlur={e => e.target.style.borderColor = '#2e2f33'}
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            style={{
              padding: '10px 18px', borderRadius: 8, border: 'none',
              background: asking || !question.trim() ? '#1e2023' : '#00d97e',
              color: asking || !question.trim() ? '#4b5563' : '#0e0f11',
              fontSize: 13, fontWeight: 700, cursor: asking || !question.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
            }}
          >
            {asking ? '…' : 'Ask →'}
          </button>
        </form>
      </div>
    </div>
  )
}

const card      = { background: '#161719', borderRadius: 12, padding: '20px 24px' }
const cardTitle = { fontSize: 13, color: '#6b7280', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }
const centerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }
