const BASE = import.meta.env.VITE_API_URL || ''

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

function post(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function uploadCSV(file, storeName, goal, category, customGoal) {
  const csv_content = await file.text()
  return post('/api/ingest', { csv_content, store_name: storeName, goal, category, custom_goal: customGoal })
}

export function loadDemo() {
  return request('/api/demo')
}

export function getAnalysis(storeData, userContext = '') {
  return post('/api/analysis', { ...storeData, user_context: userContext })
}

export function validateGoal(customGoal, category) {
  return post('/api/validate-goal', { custom_goal: customGoal, category })
}

// history: [{ q, a }] from the chat panel, sent so the agent can handle follow-ups
export function askAI(question, storeData, history = []) {
  const { store, customers, metrics, orders } = storeData || {}
  const turns = history.flatMap(({ q, a }) => [{ role: 'user', content: q }, { role: 'assistant', content: a }])
  return post('/api/ask', { store, customers, metrics, orders: orders || [], question, history: turns })
}

export function getExperimentPlan(insight, storeData) {
  const { store, metrics } = storeData || {}
  return post('/api/experiment-plan', { insight, store, metrics })
}

export function checkExperiment(experiment, progressNote) {
  return post('/api/experiment-check', { experiment, progress_note: progressNote })
}

export function runPMEngine(storeData, journeySteps = [], demographics = {}, longTermGoal = '') {
  const { store, metrics, customers, orders } = storeData || {}
  return post('/api/pm-engine', { store, metrics, customers, orders, journey_steps: journeySteps, demographics, long_term_goal: longTermGoal })
}
