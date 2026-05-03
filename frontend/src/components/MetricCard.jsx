export default function MetricCard({ label, value, delta }) {
  const isPositive = delta >= 0
  return (
    <div style={{ background: '#161719', borderRadius: 12, padding: '20px 24px', flex: 1, minWidth: 160 }}>
      <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        {label}
      </p>
      <p className="mono" style={{ fontSize: 28, fontWeight: 500, color: '#f1f1f1', marginBottom: 6 }}>
        {value}
      </p>
      {delta !== undefined && (
        <span style={{ fontSize: 12, color: isPositive ? '#00d97e' : '#f87171', fontWeight: 500 }}>
          {isPositive ? '↑' : '↓'} {Math.abs(delta)}% vs last period
        </span>
      )}
    </div>
  )
}
