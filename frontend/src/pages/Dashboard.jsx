import { useEffect, useState } from 'react'
import { getStore } from '../lib/api'
import { track } from '../lib/posthog'
import MetricCard from '../components/MetricCard'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts'

const SEGMENT_COLORS = {
  repeat: '#00d97e',
  one_time: '#a78bfa',
  at_risk: '#fbbf24',
  churned: '#f87171',
}

const CHANNEL_COLORS = {
  organic: '#00d97e',
  paid: '#a78bfa',
  email: '#fbbf24',
  direct: '#6b7280',
}

const GOAL_LABELS = {
  grow_repeat_rate: 'Grow repeat rate',
  increase_aov: 'Increase AOV',
  reduce_churn: 'Reduce churn',
  grow_revenue: 'Grow revenue',
}

// Mock daily revenue (until real time-series endpoint exists)
function mockDailyRevenue(totalRevenue) {
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: Math.round((totalRevenue / 30) * (0.6 + Math.random() * 0.8)),
    })
  }
  return days
}

export default function Dashboard() {
  const storeId = localStorage.getItem('store_id')
  const storeName = localStorage.getItem('store_name') || 'My Store'
  const goal = localStorage.getItem('store_goal') || ''
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!storeId) { setLoading(false); return }
    getStore(storeId)
      .then(d => { setData(d); track('dashboard_viewed', { store_id: storeId }) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [storeId])

  if (!storeId) return (
    <div style={centerStyle}>
      <p style={{ color: '#6b7280' }}>No store found. <a href="/upload" style={{ color: '#00d97e' }}>Upload your data first.</a></p>
    </div>
  )

  if (loading) return <div style={centerStyle}><Skeleton /></div>
  if (error) return <div style={centerStyle}><p style={{ color: '#f87171' }}>{error}</p></div>

  const m = data?.metrics || {}
  const fmt = n => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`
  const dailyRevenue = mockDailyRevenue(m.total_revenue || 0)

  // Build channel data from orders would require another endpoint; use placeholder
  const channelData = [
    { name: 'Organic', value: 42 },
    { name: 'Paid', value: 31 },
    { name: 'Email', value: 18 },
    { name: 'Direct', value: 9 },
  ]

  // Segment bar data
  const segments = [
    { name: 'Repeat buyers', key: 'repeat', pct: 32 },
    { name: 'One-time', key: 'one_time', pct: 45 },
    { name: 'At-risk 30d+', key: 'at_risk', pct: 15 },
    { name: 'Churned 90d+', key: 'churned', pct: 8 },
  ]

  return (
    <div style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f1f1f1', marginBottom: 4 }}>{storeName}</h2>
          <span style={{
            display: 'inline-block', fontSize: 11, fontWeight: 600,
            background: 'rgba(167,139,250,0.15)', color: '#a78bfa',
            padding: '3px 10px', borderRadius: 20, letterSpacing: '0.04em',
          }}>
            {GOAL_LABELS[goal] || goal}
          </span>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#00d97e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0e0f11', fontWeight: 700, fontSize: 14 }}>
          {storeName[0]}
        </div>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
        <MetricCard label="Revenue" value={fmt(m.total_revenue || 0)} delta={12.4} />
        <MetricCard label="Orders" value={m.total_orders || 0} delta={8.1} />
        <MetricCard label="Avg Order Value" value={fmt(m.aov || 0)} delta={3.2} />
        <MetricCard label="Repeat Rate" value={`${m.repeat_rate || 0}%`} delta={-2.1} />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 28 }}>
        {/* Line chart */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Daily Revenue (30d)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyRevenue}>
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} interval={6} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: '#1e2023', border: 'none', borderRadius: 8, color: '#f1f1f1', fontSize: 12 }}
                formatter={v => [`$${v}`, 'Revenue']}
              />
              <Line type="monotone" dataKey="revenue" stroke="#00d97e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Donut */}
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Channel Mix</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={channelData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                {channelData.map((entry, i) => (
                  <Cell key={i} fill={Object.values(CHANNEL_COLORS)[i]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1e2023', border: 'none', borderRadius: 8, color: '#f1f1f1', fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 4 }}>
            {channelData.map((c, i) => (
              <span key={c.name} style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: Object.values(CHANNEL_COLORS)[i], display: 'inline-block' }} />
                {c.name} {c.value}%
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Segments */}
      <div style={cardStyle}>
        <h3 style={cardTitleStyle}>Customer Segments</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
          {segments.map(seg => (
            <div key={seg.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 13, color: '#d1d5db', fontWeight: 500 }}>{seg.name}</span>
                <span className="mono" style={{ fontSize: 12, color: SEGMENT_COLORS[seg.key] }}>{seg.pct}%</span>
              </div>
              <div style={{ background: '#1e2023', borderRadius: 4, height: 6 }}>
                <div style={{ width: `${seg.pct}%`, height: '100%', borderRadius: 4, background: SEGMENT_COLORS[seg.key] }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const cardStyle = { background: '#161719', borderRadius: 12, padding: '20px 24px' }
const cardTitleStyle = { fontSize: 13, color: '#6b7280', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }
const centerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }

function Skeleton() {
  return (
    <div style={{ width: '100%' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ height: 80, background: '#161719', borderRadius: 12, marginBottom: 16, animation: 'pulse 1.5s infinite' }} />
      ))}
    </div>
  )
}
