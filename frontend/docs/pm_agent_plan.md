# PM agent: plan (not built yet)

Proactive loop: **recommend → start experiment → monitor daily → day-N verdict.**
Monitoring and verdicts are deterministic Python. The LLM writes only the wording
(recommendation, alert, verdict), using a prompt loaded from `frontend/docs/pm_agent.md`
the same way the RCA agent loads `rca_agent.md`.

## 1. Where things live today, and the blocker

- Experiments live only in the browser: `localStorage['experiments']`
  (`pages/Experiments.jsx`, `pages/NextSteps.jsx`). Store data is also localStorage only
  (`store_data`). The Vercel API is stateless, and nothing writes to Supabase today,
  even though `schema.sql` defines `stores/customers/orders`.
- **A server-side daily check can't see anything.** It has no experiments and no
  current metrics. And without the Shopify connection (out of scope), metrics only
  change when the owner re-uploads a CSV. So "daily" really means "re-evaluate the
  latest snapshot every day". The check is only as fresh as the last upload. The
  UI should say so ("Last data: Oct 20, upload a fresh export to update").

## 2. Persistence (Supabase)

Add two tables. The existing `stores` table is reused (upsert on ingest).

```sql
create table experiments (
  id             uuid primary key default gen_random_uuid(),
  store_id       text references stores(store_id) on delete cascade,
  title          text not null,          -- insight.action
  hypothesis     text,
  metric_key     text not null,          -- repeat_rate | aov | churn_rate | total_revenue
  direction      text not null default 'up',   -- up | down
  baseline       jsonb not null,         -- metrics snapshot at start (see below)
  baseline_value numeric not null,
  target_delta_pct numeric not null default 10, -- success threshold
  min_sample     int not null default 20,       -- orders needed before a verdict
  started_at     timestamptz not null default now(),
  duration_days  int not null default 14,
  status         text not null default 'running', -- running | won | lost | inconclusive | stopped
  verdict        jsonb,                  -- {result, value, delta_pct, wording}
  plan           jsonb                   -- existing plan blob from /api/experiment-plan
);

create table metric_snapshots (
  id          bigserial primary key,
  store_id    text references stores(store_id) on delete cascade,
  taken_at    timestamptz not null default now(),
  source      text not null,             -- 'upload' | 'daily_check'
  metrics     jsonb not null,            -- same shape as /api/ingest "metrics"
  data_through date                      -- latest order_date in the data
);

create table experiment_checks (
  id            bigserial primary key,
  experiment_id uuid references experiments(id) on delete cascade,
  checked_at    timestamptz not null default now(),
  value         numeric, delta_pct numeric,
  status        text,                    -- on_track | behind | regressing | insufficient_data
  alert         text                     -- LLM wording, null if no alert
);
```

Ingest writes a `metric_snapshots` row on every upload. Auth: today there are no users.
A `store_id` held in localStorage acts as a bearer secret. That's acceptable for a
pilot, but RLS and Supabase auth are needed before real brands are onboarded. This
adds one dependency (`supabase` or plain PostgREST calls via urllib, which I'd use to
stay light).

## 3. Deterministic logic (Python, unit-tested)

- **Baseline:** at `POST /api/experiments`, copy the latest snapshot's metrics and set
  `baseline_value = metrics[metric_key]`. Only order data after `started_at` counts
  toward the post period.
- **Daily check:** `delta_pct = (current - baseline) / baseline` (sign flipped for `down`
  metrics). Each experiment gets a status:
  - `insufficient_data`: fewer than `min_sample` post-start orders, or no new upload since the start
  - `regressing`: delta ≤ −5%. **Alert.**
  - `on_track`: delta ≥ the pro-rated target (target × days_elapsed / duration)
  - `behind`: anything else. Alert only on 3 consecutive `behind` checks.
- **Day-N verdict** (`days_elapsed ≥ duration_days`):
  - `won` if delta ≥ target and the sample is ≥ min_sample
  - `lost` if delta ≤ 0
  - otherwise `inconclusive`, with an option to extend once by 7 days
- **LLM wording only:** the LLM gets the verdict dict and returns 2-3 sentences. If the
  LLM is down, a template string is used. It never changes the status.
- **Recommendations:** reuse `_focus_areas` and the RCA tools for candidates. The LLM
  ranks and words at most 3 of them. No new maths.

## 4. What runs the daily check

| Option | Limits | Verdict |
|---|---|---|
| **Vercel Cron → `GET /api/cron/daily-check`** | Hobby: once per day at most, with timing only guaranteed within an hour. The 30s `maxDuration` covers the whole batch. | **Use this.** One call per day is enough. Protect it with the `CRON_SECRET` header. |
| Supabase `pg_cron` + Edge Function | Would put logic in a second runtime (Deno) | No, it duplicates the Python logic |
| GitHub Actions schedule | Can be delayed or skipped. Repos disable it after 60 days of inactivity. | Backup only |
| Railway `backend/` | Is it even deployed? It has no `/api/ask`. | Don't revive it |

Batch sizing: the deterministic checks are cheap. Only experiments that need an alert
or verdict call the LLM, so they're capped at ~10 per run (Groq RPM). The rest get
template wording and are retried the next day.

## 5. Minimal frontend changes

- `lib/api.js`: `createExperiment`, `listExperiments(storeId)`, `stopExperiment`.
- `Experiments.jsx` / `NextSteps.jsx`: read and write via the API instead of
  `localStorage['experiments']`. On first load, do a one-time migration that POSTs any
  local experiments, then clears the key.
- The experiment card shows baseline → current, a status chip, and the latest
  alert/verdict text, plus the "last data" date.
- Upload: no UI change. Ingest now also persists the store and a snapshot.

## 6. Build order (after approval)

1. Tables + ingest persistence + snapshot. 2. Experiments CRUD + baseline capture.
3. Pure check/verdict functions + tests. 4. Cron endpoint + `vercel.json` cron.
5. LLM wording with the `docs/pm_agent.md` placeholder. 6. Frontend wiring.

**Open questions:** which Vercel plan you're on? Do you want Supabase auth now or later?
Is a 10% default success threshold right, or should it vary per metric?
