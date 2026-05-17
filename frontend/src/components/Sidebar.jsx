import { NavLink } from 'react-router-dom'

const links = [
  { to: '/dashboard',   label: 'Dashboard',   icon: '▦' },
  { to: '/next-steps',  label: 'Next Steps',   icon: '✦' },
  { to: '/experiments', label: 'Experiments',  icon: '⚗' },
  { to: '/segments',    label: 'Segments',     icon: '◈' },
  { to: '/settings',    label: 'Settings',     icon: '⚙' },
]

export default function Sidebar() {
  return (
    <aside style={{ background: '#161719', width: 220, minHeight: '100vh', padding: '24px 0', flexShrink: 0, borderRight: '1px solid #1e2023' }}>
      <div style={{ padding: '0 20px 28px', borderBottom: '1px solid #1e2023' }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#00d97e', letterSpacing: '-0.5px' }}>Datawise</span>
      </div>
      <nav style={{ marginTop: 12 }}>
        {links.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 20px', fontSize: 14, fontWeight: 500,
              color: isActive ? '#00d97e' : '#9ca3af',
              textDecoration: 'none',
              background: isActive ? 'rgba(0,217,126,0.08)' : 'transparent',
              borderLeft: isActive ? '2px solid #00d97e' : '2px solid transparent',
              transition: 'color 0.15s, background 0.15s',
            })}
          >
            <span style={{ fontSize: 13, opacity: 0.7 }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
