import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Upload from './pages/Upload'
import Dashboard from './pages/Dashboard'
import NextSteps from './pages/NextSteps'
import Segments from './pages/Segments'
import Settings from './pages/Settings'

const SIDEBAR_ROUTES = ['/dashboard', '/next-steps', '/segments', '/settings']

function Layout() {
  const location = useLocation()
  const showSidebar = SIDEBAR_ROUTES.some(r => location.pathname.startsWith(r))

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {showSidebar && <Sidebar />}
      <main style={{ flex: 1, background: '#0e0f11', display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route path="/" element={<Navigate to="/upload" replace />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/next-steps" element={<NextSteps />} />
          <Route path="/segments" element={<Segments />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
