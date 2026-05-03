export default function Settings() {
  const storeName = localStorage.getItem('store_name') || '—'
  const goal = localStorage.getItem('store_goal') || '—'
  const storeId = localStorage.getItem('store_id') || '—'

  function clearData() {
    localStorage.clear()
    window.location.href = '/upload'
  }

  return (
    <div style={{ flex: 1, padding: '28px 32px', maxWidth: 560 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f1f1f1', marginBottom: 24 }}>Settings</h2>

      <div style={{ background: '#161719', borderRadius: 12, padding: '24px', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, color: '#6b7280', fontWeight: 500, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Store Info</h3>
        <Row label="Store name" value={storeName} />
        <Row label="Goal" value={goal} />
        <Row label="Store ID" value={storeId} mono />
      </div>

      <button
        onClick={clearData}
        style={{
          padding: '10px 18px', borderRadius: 8, border: '1px solid #f87171',
          background: 'transparent', color: '#f87171', fontSize: 13, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
        }}
      >
        Clear data &amp; start over
      </button>
    </div>
  )
}

function Row({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1e2023' }}>
      <span style={{ fontSize: 13, color: '#6b7280' }}>{label}</span>
      <span style={{ fontSize: 13, color: '#d1d5db', fontFamily: mono ? 'DM Mono, monospace' : undefined }}>{value}</span>
    </div>
  )
}
