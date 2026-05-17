import { useMemo, useState } from 'react'
import { track } from '../lib/posthog'

const SEGMENT_COLORS = {
  repeat: '#00d97e',
  one_time: '#a78bfa',
  at_risk: '#fbbf24',
  churned: '#f87171',
}

const SEGMENT_LABELS = {
  repeat: 'Repeat',
  one_time: 'One-time',
  at_risk: 'At-risk',
  churned: 'Churned',
}

export default function Segments() {
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('lifetime_value')

  const customers = useMemo(() => {
    try {
      const d = JSON.parse(localStorage.getItem('store_data') || 'null')
      return d?.customers || []
    } catch {
      return []
    }
  }, [])

  function handleFilter(seg) {
    setFilter(seg)
    track('segment_filtered', { segment: seg })
  }

  const filtered = customers.filter(c => filter === 'all' || c.segment === filter)
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'lifetime_value') return (b.lifetime_value || 0) - (a.lifetime_value || 0)
    const daysA = a.last_order_date ? Math.floor((Date.now() - new Date(a.last_order_date)) / 86400000) : 9999
    const daysB = b.last_order_date ? Math.floor((Date.now() - new Date(b.last_order_date)) / 86400000) : 9999
    return daysB - daysA
  })

  return (
    <div style={{ flex: 1, padding: '28px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f1f1f1', marginBottom: 4 }}>Customer Segments</h2>
        <p style={{ color: '#6b7280', fontSize: 14 }}>View and filter customers by segment</p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {['all', 'repeat', 'one_time', 'at_risk', 'churned'].map(seg => (
          <button
            key={seg}
            onClick={() => handleFilter(seg)}
            style={{
              padding: '7px 14px', borderRadius: 8,
              border: `1px solid ${filter === seg ? SEGMENT_COLORS[seg] || '#00d97e' : '#2e2f33'}`,
              background: filter === seg ? `${SEGMENT_COLORS[seg] || '#00d97e'}18` : '#161719',
              color: filter === seg ? SEGMENT_COLORS[seg] || '#00d97e' : '#9ca3af',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {seg === 'all' ? `All (${customers.length})` : `${SEGMENT_LABELS[seg]} (${customers.filter(c => c.segment === seg).length})`}
          </button>
        ))}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, border: '1px solid #2e2f33',
            background: '#161719', color: '#9ca3af', fontSize: 13, fontFamily: 'DM Sans, sans-serif',
          }}
        >
          <option value="lifetime_value">Sort: LTV</option>
          <option value="days_inactive">Sort: Days inactive</option>
        </select>
      </div>

      {customers.length === 0 ? (
        <div style={{ background: '#161719', borderRadius: 12, padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>
            Customer data will appear here after you <a href="/upload" style={{ color: '#00d97e' }}>upload your CSV</a>.
          </p>
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ background: '#161719', borderRadius: 12, padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 14 }}>No customers in this segment.</p>
        </div>
      ) : (
        <div style={{ background: '#161719', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e2023' }}>
                {['Email', 'Segment', 'LTV', 'Orders', 'Last order', 'Days since'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#6b7280', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => {
                const days = c.last_order_date ? Math.floor((Date.now() - new Date(c.last_order_date)) / 86400000) : null
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #1e2023' }}>
                    <td style={tdStyle}>{c.email || '—'}</td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: `${SEGMENT_COLORS[c.segment] || '#6b7280'}18`,
                        color: SEGMENT_COLORS[c.segment] || '#6b7280',
                      }}>
                        {SEGMENT_LABELS[c.segment] || c.segment}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>${(c.lifetime_value || 0).toFixed(2)}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{c.total_orders || 0}</td>
                    <td style={tdStyle}>{c.last_order_date ? new Date(c.last_order_date).toLocaleDateString() : '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', color: days !== null && days > 60 ? '#fbbf24' : '#9ca3af' }}>
                      {days !== null ? `${days}d` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const tdStyle = { padding: '12px 16px', color: '#d1d5db', verticalAlign: 'middle' }
