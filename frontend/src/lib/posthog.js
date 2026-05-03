import posthog from 'posthog-js'

const key = import.meta.env.VITE_POSTHOG_KEY

if (key) {
  posthog.init(key, { api_host: 'https://app.posthog.com' })
}

export function track(event, props = {}) {
  if (key) posthog.capture(event, props)
}
