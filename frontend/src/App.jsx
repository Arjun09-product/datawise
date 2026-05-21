import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect, useMemo } from 'react'
import { askAI } from './lib/api'
import Sidebar from './components/Sidebar'
import Upload from './pages/Upload'
import Dashboard from './pages/Dashboard'
import NextSteps from './pages/NextSteps'
import Segments from './pages/Segments'
import Experiments from './pages/Experiments'
import Settings from './pages/Settings'

const SIDEBAR_ROUTES = ['/dashboard', '/next-steps', '/segments', '/experiments', '/settings']

const SUGGESTIONS = [
  'What should I do next?',
  'Why is my repeat rate low?',
  'How can I grow AOV?',
  'Which customers should I target first?',
]

function GlobalAI() {
  const storeData = useMemo(() => { try { return JSON.parse(localStorage.getItem('store_data') || 'null') } catch { return null } }, [])
  const [open, setOpen]       = useState(false)
  const [question, setQuestion] = useState('')
  const [history, setHistory]   = useState([])
  const [asking, setAsking]     = useState(false)
  const inputRef   = useRef(null)
  const scrollRef  = useRef(null)

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 80) }, [open])
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [history])

  async function submit(e) {
    e?.preventDefault()
    const q = question.trim()
    if (!q || asking) return
    setQuestion(''); setAsking(true)
    try {
      const { answer } = await askAI(q, storeData)
      setHistory(p => [...p, { q, a: answer }])
    } catch {
      setHistory(p => [...p, { q, a: 'Could not get an answer right now. Try again.' }])
    } finally {
      setAsking(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function ask(q) { setQuestion(q); setTimeout(() => inputRef.current?.focus(), 50) }

  return (
    <>
      {/* Floating button — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Ask AI"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9998,
          width: 50, height: 50, borderRadius: '50%',
          background: open ? '#009e5a' : '#00d97e',
          border: '2px solid rgba(0,217,126,0.4)',
          boxShadow: '0 4px 24px rgba(0,217,126,0.5)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, color: '#0e0f11', fontWeight: 700,
          transition: 'background .15s, box-shadow .15s',
        }}
      >
        {open ? '×' : '✦'}
      </button>

      {/* Panel */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9997 }} />
          <div style={{
            position: 'fixed', bottom: 84, right: 24, width: 390, maxHeight: 500,
            background: '#161719', border: '1px solid #2e2f33', borderRadius: 18,
            zIndex: 9999, boxShadow: '0 16px 60px rgba(0,0,0,0.8)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #1e2023', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,217,126,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#00d97e' }}>✦</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#f1f1f1' }}>Ask Datawise AI</p>
                <p style={{ fontSize: 11, color: '#4b5563' }}>Powered by your store data</p>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>

            {/* Conversation */}
            {history.length > 0 ? (
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {history.map((item, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, background: '#1e2023', color: '#d1d5db', padding: '6px 12px', borderRadius: '12px 12px 2px 12px', maxWidth: '80%', lineHeight: 1.5 }}>{item.q}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 11, color: '#00d97e', flexShrink: 0, marginTop: 3 }}>✦</span>
                      <p style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.65 }}>{item.a}</p>
                    </div>
                  </div>
                ))}
                {asking && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#00d97e' }}>✦</span>
                    <p style={{ fontSize: 12, color: '#4b5563' }}>Thinking…</p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '14px 18px' }}>
                <p style={{ fontSize: 12, color: '#4b5563', marginBottom: 10 }}>Try asking:</p>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => ask(s)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', marginBottom: 6, borderRadius: 8, border: '1px solid #1e2023', background: '#0e0f11', color: '#9ca3af', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', transition: 'border-color .15s' }}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <form onSubmit={submit} style={{ padding: '10px 12px', borderTop: '1px solid #1e2023', display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Ask anything about your store…"
                style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid #2e2f33', background: '#0e0f11', color: '#f1f1f1', fontSize: 13, fontFamily: 'DM Sans, sans-serif', outline: 'none' }}
              />
              <button type="submit" disabled={asking || !question.trim()} style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: asking || !question.trim() ? '#1e2023' : '#00d97e', color: asking || !question.trim() ? '#4b5563' : '#0e0f11', fontSize: 13, fontWeight: 700, cursor: asking || !question.trim() ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                →
              </button>
            </form>
          </div>
        </>
      )}
    </>
  )
}

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
          <Route path="/experiments" element={<Experiments />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      {showSidebar && <GlobalAI />}
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
