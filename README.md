# Datawise

AI-powered Shopify analytics — upload a CSV of orders, get PM-style next steps from Claude.

## Stack

- **Frontend**: React + Vite + Tailwind CSS + Recharts
- **Backend**: Python + FastAPI
- **Database**: Supabase (Postgres)
- **AI**: Anthropic Claude (claude-sonnet-4-20250514)
- **Analytics**: PostHog

---

## Local setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Open **SQL editor** and run `schema.sql` from the repo root
3. Copy your **Project URL** and **anon key** from Project Settings → API

### 2. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install fastapi uvicorn supabase python-dotenv anthropic python-multipart pandas

cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_API_KEY

uvicorn main:app --reload
# Runs on http://localhost:8000
```

### 3. Frontend

```bash
cd frontend
npm install

cp .env.example .env
# Set VITE_API_URL=http://localhost:8000
# Optionally set VITE_POSTHOG_KEY

npm run dev
# Runs on http://localhost:5173
```

---

## CSV format

Required columns: `order_id`, `email`, `order_date`, `total`

Optional: `subtotal`, `discount_amount`, `channel` (organic/paid/email/direct), `status`, `country`, `city`, `product_title`, `quantity`, `unit_price`

---

## Deploying

### Frontend → Vercel

1. Push `frontend/` to GitHub
2. Import repo in Vercel
3. Set env vars: `VITE_API_URL` (your Railway URL), `VITE_POSTHOG_KEY`
4. Deploy — `vercel.json` handles SPA routing

### Backend → Railway

1. Push `backend/` to GitHub (or whole monorepo)
2. Create a new Railway project → Deploy from GitHub
3. Set env vars: `SUPABASE_URL`, `SUPABASE_KEY`, `ANTHROPIC_API_KEY`
4. `railway.toml` sets the start command automatically

---

## Env vars reference

| Variable | Where | Description |
|---|---|---|
| `SUPABASE_URL` | backend | Supabase project URL |
| `SUPABASE_KEY` | backend | Supabase anon/service key |
| `ANTHROPIC_API_KEY` | backend | Anthropic API key |
| `VITE_API_URL` | frontend | Backend base URL |
| `VITE_POSTHOG_KEY` | frontend | PostHog project API key (optional) |
