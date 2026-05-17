export default function Logo({ size = 'md' }) {
  const iconSize = size === 'sm' ? 28 : 36
  const fontSize = size === 'sm' ? 6.5 : 8
  const textSize = size === 'sm' ? 16 : 22
  const radius   = size === 'sm' ? 7 : 9

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{
        width: iconSize, height: iconSize, borderRadius: radius,
        background: '#00d97e', flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize, fontWeight: 900, color: '#0e0f11', lineHeight: 1.1, letterSpacing: '0.04em', fontFamily: 'Arial Black, Arial, sans-serif' }}>DATA</span>
        <span style={{ fontSize, fontWeight: 900, color: '#0e0f11', lineHeight: 1.1, letterSpacing: '0.04em', fontFamily: 'Arial Black, Arial, sans-serif' }}>WISE</span>
      </div>
      <span style={{ fontSize: textSize, fontWeight: 700, color: '#00d97e', letterSpacing: '-0.5px' }}>Datawise</span>
    </div>
  )
}
