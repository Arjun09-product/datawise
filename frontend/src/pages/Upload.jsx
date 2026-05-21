import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadCSV, loadDemo, runPMEngine } from '../lib/api'
import { track } from '../lib/posthog'

// ── Static data ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: 'sports',      label: 'Fitness',      icon: '🏋️' },
  { value: 'clothing',    label: 'Clothing',     icon: '👗' },
  { value: 'beauty',      label: 'Beauty',       icon: '💄' },
  { value: 'food',        label: 'Food & drink', icon: '🍕' },
  { value: 'home',        label: 'Home',         icon: '🏠' },
  { value: 'electronics', label: 'Electronics',  icon: '⚡' },
  { value: 'other',       label: 'Other',        icon: '◦' },
]
const AGE_GROUPS = ['Under 18', '18–24', '25–34', '35–44', '45–54', '55+']
const REGIONS    = ['UK', 'US', 'Europe', 'Asia', 'Australia', 'Global']
const GENDERS    = [
  { value: 'mostly_women', label: 'Mostly women' },
  { value: 'mostly_men',   label: 'Mostly men' },
  { value: 'equal',        label: 'Equal mix' },
]
const GOALS = [
  { value: 'grow_repeat_rate', label: 'Grow repeat rate',  icon: '🔄', desc: 'Turn one-time buyers into loyal customers' },
  { value: 'increase_aov',     label: 'Increase AOV',      icon: '💰', desc: 'Get customers to spend more per order' },
  { value: 'grow_revenue',     label: 'Grow total orders', icon: '📈', desc: 'Bring in more transactions every month' },
  { value: 'reduce_churn',     label: 'Reduce churn',      icon: '🔕', desc: 'Stop losing customers to inactivity' },
]
const JOURNEY_TEMPLATES = {
  sports:      ['See ad or organic content', 'Visit product listing', 'View product detail', 'Add to cart', 'Complete first purchase', 'Return for repeat purchase'],
  clothing:    ['Discover brand via social or search', 'Browse collection', 'View product detail', 'Add to cart', 'Complete checkout', 'Become a loyal repeat buyer'],
  beauty:      ['See review or recommendation', 'Browse products', 'Read details / ingredients', 'Add to cart', 'First purchase', 'Repurchase or subscribe'],
  food:        ['See ad or menu', 'Browse options', 'Add items to order', 'Checkout', 'Receive first order', 'Reorder within 30 days'],
  home:        ['Research and compare online', 'View product detail', 'Add to cart', 'Purchase', 'Receive and use product', 'Leave review or repurchase'],
  electronics: ['Research and compare specs', 'View product detail', 'Add to cart', 'Purchase', 'Setup / onboarding', 'Buy accessories or upgrade'],
  other:       ['Discover product', 'Browse and compare', 'View product detail', 'Add to cart', 'Complete purchase', 'Return to buy again'],
}

function saveAll(storeRes, pmData, onboarding) {
  localStorage.setItem('store_id',   storeRes.store_id)
  localStorage.setItem('store_name', storeRes.store.name)
  localStorage.setItem('store_goal', storeRes.store.goal)
  localStorage.setItem('store_data', JSON.stringify(storeRes))
  localStorage.setItem('pm_data',    JSON.stringify(pmData))
  localStorage.setItem('onboarding', JSON.stringify(onboarding))
}

// ── Left panel ────────────────────────────────────────────────────────────────
function LeftPanel() {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', minHeight: '100vh', background: '#0b0c0e' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 55% at 50% 105%, rgba(0,60,35,0.65) 0%, transparent 70%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 45% at 85% 10%, rgba(15,25,45,0.85) 0%, transparent 70%)' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(62deg, rgba(0,229,160,0.025) 0px, rgba(0,229,160,0.025) 1px, transparent 1px, transparent 38px)' }} />
      <div style={{ position: 'relative', zIndex: 2, padding: '36px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '100vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '5px 6px 4px', gap: 2 }}>
            {[{h:8,o:.28},{h:12,o:.55},{h:17,o:.85},{h:22,o:1}].map((b,i) => (
              <div key={i} style={{ width: 4, height: b.h, background: '#00e5a0', opacity: b.o, borderRadius: '1px 1px 0 0' }} />
            ))}
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>Data<span style={{ color: '#00e5a0' }}>WISE</span></span>
        </div>

        <div>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#00e5a0', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 14 }}>Your AI product manager</p>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: '#fff', lineHeight: 1.12, letterSpacing: '-1.2px', marginBottom: 14 }}>
            Tell us about<br />your brand.<br /><span style={{ color: '#00e5a0' }}>We'll do the rest.</span>
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, maxWidth: 280 }}>
            Upload your order data, map your customer journey, and get a live PM dashboard built around your specific goal.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {['Journey-to-metric engine powered by AI', 'Industry benchmarks per product vertical', 'Experiment tracking with AI coaching'].map((t, i) => (
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

// ── Step nav ──────────────────────────────────────────────────────────────────
const STEP_LABELS = ['Business', 'Audience', 'Goal', 'Journey', 'Data']
function StepNav({ step }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
        {STEP_LABELS.map((label, i) => {
          const n = i + 1
          const done = n < step, active = n === step
          return (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 4, flex: n < 5 ? 1 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  ...(done   ? { background: '#0d2419', border: '1px solid #00e5a0', color: '#00e5a0' }
                    : active ? { background: '#00e5a0', border: '1px solid #00e5a0', color: '#000' }
                    :          { background: '#0f1013', border: '1px solid #1e2128', color: '#3a3a38' }),
                }}>
                  {done ? '✓' : n}
                </div>
                <span style={{ fontSize: 11, fontWeight: active ? 600 : 400, color: active ? '#f2f2f0' : done ? '#00e5a0' : '#3a3a38', whiteSpace: 'nowrap' }}>
                  {label}
                </span>
              </div>
              {n < 5 && <div style={{ flex: 1, height: 1, background: done ? 'rgba(0,229,160,0.3)' : '#1e2128', marginLeft: 4 }} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Step 1: Business ──────────────────────────────────────────────────────────
function Step1({ storeName, setStoreName, category, setCategory, website, setWebsite, onNext }) {
  return (
    <>
      <div style={sh}>Tell us about your business</div>
      <div style={ss}>The basics — takes 30 seconds.</div>
      <div style={card}>
        <div style={cl}>Store / brand name</div>
        <input style={inp} placeholder="e.g. Gainz Supply Co." value={storeName} onChange={e => setStoreName(e.target.value)} />
      </div>
      <div style={card}>
        <div style={cl}>What do you sell?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {CATEGORIES.map(c => (
            <button key={c.value} type="button" onClick={() => setCategory(c.value)} style={chip(category === c.value)}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>
      <div style={card}>
        <div style={cl}>Website <span style={{ color: '#3a3a38', fontWeight: 400 }}>(optional)</span></div>
        <input style={inp} placeholder="e.g. gainzsupply.com" value={website} onChange={e => setWebsite(e.target.value)} />
      </div>
      <button onClick={onNext} disabled={!storeName.trim() || !category} style={btnPrimary(!storeName.trim() || !category)}>Continue →</button>
    </>
  )
}

// ── Step 2: Audience ──────────────────────────────────────────────────────────
function Step2({ ageGroups, setAgeGroups, regions, setRegions, gender, setGender, onNext, onBack }) {
  function toggleArr(val, arr, setArr) {
    setArr(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val])
  }
  return (
    <>
      <div style={sh}>Who are your customers?</div>
      <div style={ss}>Helps personalise your PM engine recommendations.</div>
      <div style={card}>
        <div style={cl}>Age groups <span style={{ color: '#3a3a38', fontWeight: 400 }}>(select all that apply)</span></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {AGE_GROUPS.map(a => (
            <button key={a} type="button" onClick={() => toggleArr(a, ageGroups, setAgeGroups)} style={chip(ageGroups.includes(a))}>{a}</button>
          ))}
        </div>
      </div>
      <div style={card}>
        <div style={cl}>Primary regions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {REGIONS.map(r => (
            <button key={r} type="button" onClick={() => toggleArr(r, regions, setRegions)} style={chip(regions.includes(r))}>{r}</button>
          ))}
        </div>
      </div>
      <div style={card}>
        <div style={cl}>Gender split</div>
        <div style={{ display: 'flex', gap: 7 }}>
          {GENDERS.map(g => (
            <button key={g.value} type="button" onClick={() => setGender(g.value)} style={chip(gender === g.value)}>{g.label}</button>
          ))}
        </div>
      </div>
      <button onClick={onNext} style={btnPrimary(false)}>Continue →</button>
      <button onClick={onBack} style={btnGhost}>← Back</button>
    </>
  )
}

// ── Step 3: Goal ──────────────────────────────────────────────────────────────
function Step3({ goalKey, setGoalKey, longTermGoal, setLongTermGoal, onNext, onBack }) {
  return (
    <>
      <div style={sh}>What's your goal?</div>
      <div style={ss}>Your PM engine filters every recommendation through this.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {GOALS.map(g => (
          <div key={g.value} onClick={() => setGoalKey(g.value)} style={goalCard(goalKey === g.value)}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: goalKey === g.value ? '#132b1e' : '#1a1c20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{g.icon}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: goalKey === g.value ? '#00e5a0' : '#c0c0be' }}>{g.label}</div>
              <div style={{ fontSize: 12, color: '#3e3e3c', marginTop: 2 }}>{g.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={card}>
        <div style={cl}>Long-term vision <span style={{ color: '#3a3a38', fontWeight: 400 }}>(optional)</span></div>
        <textarea
          style={{ ...inp, resize: 'vertical', minHeight: 72, lineHeight: 1.6 }}
          placeholder="e.g. Become the #1 fitness brand for women 25–34 in the UK by 2026"
          value={longTermGoal}
          onChange={e => setLongTermGoal(e.target.value)}
        />
      </div>
      <button onClick={onNext} disabled={!goalKey} style={btnPrimary(!goalKey)}>Continue →</button>
      <button onClick={onBack} style={btnGhost}>← Back</button>
    </>
  )
}

// ── Step 4: Journey ───────────────────────────────────────────────────────────
function Step4({ journeySteps, setJourneySteps, category, onNext, onBack }) {
  function update(i, val) {
    const next = [...journeySteps]; next[i] = val; setJourneySteps(next)
  }
  function add() {
    setJourneySteps([...journeySteps, ''])
  }
  function remove(i) {
    if (journeySteps.length <= 2) return
    setJourneySteps(journeySteps.filter((_, idx) => idx !== i))
  }

  return (
    <>
      <div style={sh}>Map your customer journey</div>
      <div style={ss}>The ideal path from stranger to loyal buyer. We pre-filled a template — edit to match your store.</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {journeySteps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#00e5a0', color: '#000', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
            <input
              style={{ ...inp, flex: 1, padding: '9px 12px' }}
              value={step}
              onChange={e => update(i, e.target.value)}
              placeholder={`Step ${i + 1}`}
            />
            {journeySteps.length > 2 && (
              <button type="button" onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: '#3a3a38', cursor: 'pointer', fontSize: 16, padding: '4px 6px', lineHeight: 1 }}>×</button>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={add} style={{ ...btnGhost, marginTop: 0, marginBottom: 14, color: '#00e5a0', borderColor: 'rgba(0,229,160,0.3)' }}>+ Add step</button>
      <button onClick={onNext} disabled={journeySteps.filter(s => s.trim()).length < 2} style={btnPrimary(journeySteps.filter(s => s.trim()).length < 2)}>Continue →</button>
      <button onClick={onBack} style={btnGhost}>← Back</button>
    </>
  )
}

// ── Step 5: Upload ────────────────────────────────────────────────────────────
function Step5({ file, setFile, dragging, setDragging, fileRef, handleDrop, loading, demoLoading, error, onSubmit, onDemo, onBack }) {
  return (
    <>
      <div style={sh}>Upload your order data</div>
      <div style={ss}>A Shopify or WooCommerce orders CSV — we need order_id, email, order_date, total.</div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{ border: `1.5px dashed ${dragging || file ? '#00e5a0' : '#1e2128'}`, borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', background: dragging ? 'rgba(0,229,160,0.04)' : '#0b0c0e', transition: 'border-color .15s', marginBottom: 4 }}
      >
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
        {file ? (
          <p style={{ color: '#00e5a0', fontSize: 14, fontWeight: 600 }}>✓ {file.name}</p>
        ) : (
          <>
            <div style={{ fontSize: 26, marginBottom: 10 }}>📂</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#c0c0be', marginBottom: 6 }}>Drop CSV or click to browse</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {['.csv', 'Shopify export', 'WooCommerce'].map(t => (
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
      <button onClick={onDemo} disabled={demoLoading} style={{ ...btnGhost, marginTop: 0, marginBottom: 4 }}>
        {demoLoading ? 'Loading…' : 'Try with sample data →'}
      </button>

      {error && <p style={{ color: '#f87171', fontSize: 13, margin: '8px 0' }}>{error}</p>}

      <button onClick={onSubmit} disabled={loading || !file} style={btnPrimary(loading || !file)}>
        {loading ? 'Analysing your store…' : 'Build my PM dashboard →'}
      </button>
      <button onClick={onBack} style={btnGhost}>← Back</button>
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Upload() {
  const navigate = useNavigate()
  const fileRef  = useRef(null)

  const [step,         setStep]         = useState(1)
  const [storeName,    setStoreName]    = useState('')
  const [category,     setCategory]     = useState('')
  const [website,      setWebsite]      = useState('')
  const [ageGroups,    setAgeGroups]    = useState([])
  const [regions,      setRegions]      = useState([])
  const [gender,       setGender]       = useState('')
  const [goalKey,      setGoalKey]      = useState('')
  const [longTermGoal, setLongTermGoal] = useState('')
  const [journeySteps, setJourneySteps] = useState([])
  const [file,         setFile]         = useState(null)
  const [dragging,     setDragging]     = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [demoLoading,  setDemoLoading]  = useState(false)
  const [error,        setError]        = useState(null)

  function goToStep(n) {
    if (n === 4 && journeySteps.length === 0) {
      setJourneySteps(JOURNEY_TEMPLATES[category] || JOURNEY_TEMPLATES.other)
    }
    setStep(n)
  }

  function handleDrop(e) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.csv')) setFile(f)
  }

  async function processAndNavigate(storeRes) {
    const onboarding = { website, ageGroups, regions, gender, longTermGoal, journeySteps }
    let pmData = null
    try {
      pmData = await runPMEngine(storeRes, journeySteps, { age_groups: ageGroups, regions, gender }, longTermGoal)
    } catch { /* non-fatal — dashboard still works without PM data */ }
    saveAll(storeRes, pmData, onboarding)
    navigate('/dashboard')
  }

  async function handleSubmit() {
    if (!file) return
    setLoading(true); setError(null)
    try {
      const res = await uploadCSV(file, storeName, goalKey, category, null)
      track('csv_uploaded', { store_id: res.store_id, row_count: res.rows_processed })
      await processAndNavigate(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDemo() {
    setDemoLoading(true); setError(null)
    try {
      const { loadDemo } = await import('../lib/api')
      const res = await loadDemo()
      track('demo_loaded')
      if (!journeySteps.length) setJourneySteps(JOURNEY_TEMPLATES[category] || JOURNEY_TEMPLATES.sports)
      await processAndNavigate(res)
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
        <div style={{ maxWidth: 400, width: '100%' }}>
          <StepNav step={step} />
          {step === 1 && <Step1 storeName={storeName} setStoreName={setStoreName} category={category} setCategory={setCategory} website={website} setWebsite={setWebsite} onNext={() => setStep(2)} />}
          {step === 2 && <Step2 ageGroups={ageGroups} setAgeGroups={setAgeGroups} regions={regions} setRegions={setRegions} gender={gender} setGender={setGender} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
          {step === 3 && <Step3 goalKey={goalKey} setGoalKey={setGoalKey} longTermGoal={longTermGoal} setLongTermGoal={setLongTermGoal} onNext={() => goToStep(4)} onBack={() => setStep(2)} />}
          {step === 4 && <Step4 journeySteps={journeySteps} setJourneySteps={setJourneySteps} category={category} onNext={() => setStep(5)} onBack={() => setStep(3)} />}
          {step === 5 && <Step5 file={file} setFile={setFile} dragging={dragging} setDragging={setDragging} fileRef={fileRef} handleDrop={handleDrop} loading={loading} demoLoading={demoLoading} error={error} onSubmit={handleSubmit} onDemo={handleDemo} onBack={() => setStep(4)} />}
        </div>
      </div>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const sh   = { fontSize: 19, fontWeight: 700, color: '#f2f2f0', letterSpacing: '-0.5px' }
const ss   = { fontSize: 13, color: '#4a4a48', marginTop: 4, marginBottom: 20 }
const card = { background: '#161719', border: '1px solid #1e2128', borderRadius: 12, padding: 16, marginBottom: 10 }
const cl   = { fontSize: 11, fontWeight: 600, color: '#4a4a48', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 10 }
const inp  = { width: '100%', background: '#0f1013', border: '1px solid #1e2128', borderRadius: 8, padding: '10px 13px', fontSize: 13, color: '#f2f2f0', fontFamily: 'DM Sans, sans-serif', outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s' }

function chip(active) {
  return { padding: '7px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer', border: `1px solid ${active ? '#00e5a0' : '#1e2128'}`, background: active ? '#0d1f17' : '#0f1013', color: active ? '#00e5a0' : '#7a7a78', fontFamily: 'DM Sans, sans-serif', transition: 'all .15s' }
}
function goalCard(active) {
  return { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${active ? '#00e5a0' : '#1e2128'}`, background: active ? '#0d1f17' : '#0f1013', transition: 'all .15s' }
}
function btnPrimary(disabled) {
  return { width: '100%', padding: 13, background: disabled ? '#1a1c20' : '#00e5a0', color: disabled ? '#3a3a38' : '#000', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', marginTop: 14 }
}
const btnGhost = { width: '100%', padding: 11, background: 'transparent', color: '#4a4a48', fontSize: 13, border: '1px solid #1e2128', borderRadius: 10, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', marginTop: 8 }
