import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadCSV, loadDemo } from '../lib/api'
import { track } from '../lib/posthog'

const CATEGORIES = [
  { value: 'sports',      label: 'Fitness',      icon: '🏋️' },
  { value: 'clothing',    label: 'Clothing',     icon: '👗' },
  { value: 'beauty',      label: 'Beauty',       icon: '💄' },
  { value: 'food',        label: 'Food & drink', icon: '🍕' },
  { value: 'home',        label: 'Home',         icon: '🏠' },
  { value: 'electronics', label: 'Electronics',  icon: '⚡' },
  { value: 'other',       label: 'Other',        icon: '◦' },
]

const GOALS = [
  { value: 'grow_repeat_rate', label: 'Grow repeat rate',  icon: '🔄', desc: 'Turn one-time buyers into loyal customers' },
  { value: 'increase_aov',     label: 'Increase AOV',      icon: '💰', desc: 'Get customers to spend more per order' },
  { value: 'grow_revenue',     label: 'Grow total orders', icon: '📈', desc: 'Bring in more transactions every month' },
  { value: 'reduce_churn',     label: 'Reduce churn',      icon: '🔕', desc: 'Stop losing customers to inactivity' },
]

function saveStoreData(res) {
  localStorage.setItem('store_id',   res.store_id)
  localStorage.setItem('store_name', res.store.name)
  localStorage.setItem('store_goal', res.store.goal)
  localStorage.setItem('store_data', JSON.stringify(res))
}

// ── Left marketing panel ──────────────────────────────────────────────────────
function LeftPanel() {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', minHeight: '100vh', background: '#0b0c0e' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 55% at 50% 105%, rgba(0,60,35,0.65) 0%, transparent 70%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 45% at 85% 10%, rgba(15,25,45,0.85) 0%, transparent 70%)' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(62deg, rgba(0,229,160,0.025) 0px, rgba(0,229,160,0.025) 1px, transparent 1px, transparent 38px)' }} />

      <div style={{ position: 'relative', zIndex: 2, padding: '36px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '100vh' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '5px 6px 4px', gap: 2, flexShrink: 0 }}>
            {[{ h: 8, o: 0.28 }, { h: 12, o: 0.55 }, { h: 17, o: 0.85 }, { h: 22, o: 1 }].map((b, i) => (
              <div key={i} style={{ width: 4, height: b.h, background: '#00e5a0', opacity: b.o, borderRadius: '1px 1px 0 0' }} />
            ))}
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
            Data<span style={{ color: '#00e5a0' }}>WISE</span>
          </span>
        </div>

        {/* Hero */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#00e5a0', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 14 }}>
            For e-commerce sellers
          </p>
          <h1 style={{ fontSize: 34, fontWeight: 800, color: '#fff', lineHeight: 1.12, letterSpacing: '-1.2px', marginBottom: 14 }}>
            Your data finally<br />tells you what<br />to do.
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, maxWidth: 280 }}>
            Stop staring at spreadsheets. Upload your store data, pick a goal, get a plain-English action plan in minutes.
          </p>
        </div>

        {/* Proof */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {['Works with Shopify, WooCommerce & more', 'No analyst or technical setup needed', 'Free to get started'].map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e5a0', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Step nav dots ─────────────────────────────────────────────────────────────
function StepNav({ step }) {
  const dot = (n) => ({
    width: 28, height: 28, borderRadius: '50%', fontSize: 11, fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    ...(n < step
      ? { background: '#0d2419', border: '1px solid #00e5a0', color: '#00e5a0' }
      : n === step
        ? { background: '#00e5a0', border: '1px solid #00e5a0', color: '#000' }
        : { background: '#0f1013', border: '1px solid #1e2128', color: '#4a4a48' }),
  })
  const line = (n) => ({
    flex: 1, height: 1,
    background: n < step ? 'rgba(0,229,160,0.3)' : '#1e2128',
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 28 }}>
      <div style={dot(1)}>{step > 1 ? '✓' : '1'}</div>
      <div style={line(1)} />
      <div style={dot(2)}>{step > 2 ? '✓' : '2'}</div>
      <div style={line(2)} />
      <div style={dot(3)}>3</div>
    </div>
  )
}

// ── Step 1: Store name + category ─────────────────────────────────────────────
function Step1({ storeName, setStoreName, category, setCategory, onNext }) {
  const canNext = storeName.trim() && category
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 700, color: '#f2f2f0', letterSpacing: '-0.5px' }}>Tell us about your store</div>
      <div style={{ fontSize: 13, color: '#4a4a48', marginTop: 4, marginBottom: 22 }}>Just the basics — we handle everything else.</div>

      <div style={card}>
        <div style={clabel}>Store name</div>
        <input
          style={inp}
          placeholder="e.g. Gainz Supply Co."
          value={storeName}
          onChange={e => setStoreName(e.target.value)}
        />
      </div>

      <div style={card}>
        <div style={clabel}>What do you sell?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {CATEGORIES.map(c => (
            <button key={c.value} type="button" onClick={() => setCategory(c.value)} style={chip(category === c.value)}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={onNext} disabled={!canNext} style={btn(!canNext)}>Continue →</button>
    </>
  )
}

// ── Step 2: Goal ──────────────────────────────────────────────────────────────
function Step2({ goalKey, setGoalKey, onNext, onBack }) {
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 700, color: '#f2f2f0', letterSpacing: '-0.5px' }}>What's your main goal?</div>
      <div style={{ fontSize: 13, color: '#4a4a48', marginTop: 4, marginBottom: 22 }}>Everything we suggest filters through this.</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
        {GOALS.map(g => (
          <div key={g.value} onClick={() => setGoalKey(g.value)} style={goalCard(goalKey === g.value)}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: goalKey === g.value ? '#132b1e' : '#1a1c20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
              {g.icon}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: goalKey === g.value ? '#00e5a0' : '#c0c0be' }}>{g.label}</div>
              <div style={{ fontSize: 12, color: '#3e3e3c', marginTop: 2 }}>{g.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={onNext} disabled={!goalKey} style={{ ...btn(!goalKey), marginTop: 14 }}>Continue →</button>
      <button onClick={onBack} style={btnGhost}>← Back</button>
    </>
  )
}

// ── Step 3: CSV upload ────────────────────────────────────────────────────────
function Step3({ file, setFile, dragging, setDragging, fileRef, handleDrop, loading, demoLoading, error, onSubmit, onDemo, onBack, canSubmit }) {
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 700, color: '#f2f2f0', letterSpacing: '-0.5px' }}>Upload your store data</div>
      <div style={{ fontSize: 13, color: '#4a4a48', marginTop: 4, marginBottom: 22 }}>A Shopify orders CSV is all you need.</div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragging || file ? '#00e5a0' : '#1e2128'}`,
          borderRadius: 12, padding: '28px 20px', textAlign: 'center',
          cursor: 'pointer', background: dragging ? 'rgba(0,229,160,0.04)' : '#0b0c0e',
          transition: 'border-color 0.15s',
          marginBottom: 0,
        }}
      >
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
        {file ? (
          <p style={{ color: '#00e5a0', fontSize: 14, fontWeight: 500 }}>✓ {file.name}</p>
        ) : (
          <>
            <div style={{ fontSize: 26, marginBottom: 10 }}>📂</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#c0c0be', marginBottom: 6 }}>Drop your CSV or click to browse</div>
            <div style={{ fontSize: 12, color: '#3a3a38', marginBottom: 12 }}>Needs: order_id · email · order_date · total</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {['.csv', '.xlsx', 'Shopify export'].map(t => (
                <span key={t} style={{ fontSize: 11, fontFamily: 'monospace', color: '#4a4a48', background: '#1a1c20', border: '1px solid #1e2128', borderRadius: 4, padding: '3px 8px' }}>{t}</span>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
        <div style={{ flex: 1, height: 1, background: '#1a1c20' }} />
        <span style={{ fontSize: 12, color: '#2e2e2c' }}>or</span>
        <div style={{ flex: 1, height: 1, background: '#1a1c20' }} />
      </div>

      <button onClick={onDemo} disabled={demoLoading} style={{ ...btnGhost, marginTop: 0 }}>
        {demoLoading ? 'Loading…' : 'Try with sample data →'}
      </button>

      {error && <p style={{ color: '#f87171', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}

      <button onClick={onSubmit} disabled={loading || !canSubmit} style={{ ...btn(loading || !canSubmit), marginTop: 12 }}>
        {loading ? 'Analysing…' : 'Analyse my store →'}
      </button>
      <button onClick={onBack} style={btnGhost}>← Back</button>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Upload() {
  const navigate  = useNavigate()
  const fileRef   = useRef(null)

  const [step,        setStep]        = useState(1)
  const [storeName,   setStoreName]   = useState('')
  const [category,    setCategory]    = useState('')
  const [goalKey,     setGoalKey]     = useState('')
  const [file,        setFile]        = useState(null)
  const [dragging,    setDragging]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [error,       setError]       = useState(null)

  function handleDrop(e) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.csv')) setFile(f)
  }

  async function handleSubmit() {
    if (!file || !storeName || !category || !goalKey) return
    setLoading(true); setError(null)
    try {
      const res = await uploadCSV(file, storeName, goalKey, category, null)
      track('csv_uploaded', { store_id: res.store_id, row_count: res.rows_processed })
      saveStoreData(res)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDemo() {
    setDemoLoading(true); setError(null)
    try {
      const res = await loadDemo()
      track('demo_loaded')
      saveStoreData(res)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setDemoLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
      <LeftPanel />
      <div style={{ background: '#0f1013', padding: '40px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflowY: 'auto' }}>
        <div style={{ maxWidth: 380, width: '100%' }}>
          <StepNav step={step} />
          {step === 1 && (
            <Step1
              storeName={storeName} setStoreName={setStoreName}
              category={category} setCategory={setCategory}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2
              goalKey={goalKey} setGoalKey={setGoalKey}
              onNext={() => setStep(3)} onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <Step3
              file={file} setFile={setFile}
              dragging={dragging} setDragging={setDragging}
              fileRef={fileRef} handleDrop={handleDrop}
              loading={loading} demoLoading={demoLoading}
              error={error}
              onSubmit={handleSubmit} onDemo={handleDemo}
              onBack={() => setStep(2)}
              canSubmit={!!(file && storeName && category && goalKey)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const card = {
  background: '#161719', border: '1px solid #1e2128', borderRadius: 13,
  padding: 18, marginBottom: 10,
}
const clabel = {
  fontSize: 11, fontWeight: 500, color: '#4a4a48',
  letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10,
}
const inp = {
  width: '100%', background: '#0f1013', border: '1px solid #1e2128',
  borderRadius: 8, padding: '11px 14px', fontSize: 14,
  color: '#f2f2f0', fontFamily: 'DM Sans, sans-serif', outline: 'none',
  boxSizing: 'border-box', transition: 'border-color .15s',
}

function chip(active) {
  return {
    padding: '7px 13px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
    border: `1px solid ${active ? '#00e5a0' : '#1e2128'}`,
    background: active ? '#0d1f17' : '#0f1013',
    color: active ? '#00e5a0' : '#7a7a78',
    fontFamily: 'DM Sans, sans-serif',
    transition: 'all .15s',
  }
}

function goalCard(active) {
  return {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
    border: `1px solid ${active ? '#00e5a0' : '#1e2128'}`,
    background: active ? '#0d1f17' : '#0f1013',
    transition: 'all .15s',
  }
}

function btn(disabled) {
  return {
    width: '100%', padding: 13, background: disabled ? '#1a1c20' : '#00e5a0',
    color: disabled ? '#3a3a38' : '#000', fontSize: 14, fontWeight: 700,
    border: 'none', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'DM Sans, sans-serif', transition: 'opacity .15s',
  }
}

const btnGhost = {
  width: '100%', padding: 11, background: 'transparent',
  color: '#4a4a48', fontSize: 13, border: '1px solid #1e2128',
  borderRadius: 10, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
  marginTop: 8, transition: 'all .15s',
}
