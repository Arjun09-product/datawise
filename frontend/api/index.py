import os
import csv
import io
import re
import time
import uuid
import json
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from mangum import Mangum

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CHANNEL_OPTIONS = ["organic", "paid", "email", "direct"]
GOAL_LABELS = {
    "grow_repeat_rate": "Grow repeat rate",
    "increase_aov": "Increase AOV",
    "reduce_churn": "Reduce churn",
    "grow_revenue": "Grow revenue",
}
HAIKU = "claude-haiku-4-5-20251001"


# ── Models ────────────────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    csv_content: str
    store_name: str
    goal: str
    category: str = "other"
    custom_goal: Optional[str] = None

class AnalysisRequest(BaseModel):
    store: dict
    customers: list
    orders: list
    metrics: dict
    user_context: Optional[str] = None

class AskRequest(BaseModel):
    store: dict
    customers: list
    metrics: dict
    question: str
    orders: list = []
    # prior turns for follow-ups: [{"role": "user"|"assistant", "content": "..."}]
    history: list = []

class ValidateGoalRequest(BaseModel):
    custom_goal: str
    category: str = ""

class ExperimentPlanRequest(BaseModel):
    insight: dict
    store: dict
    metrics: dict

class ExperimentCheckRequest(BaseModel):
    experiment: dict
    progress_note: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_float(val, default=0.0):
    try:
        return float(val)
    except (TypeError, ValueError):
        return default

def _classify_segment(total_orders: int, days_since: int) -> str:
    if total_orders >= 2:
        return "repeat"
    if days_since >= 90:
        return "churned"
    if days_since >= 30:
        return "at_risk"
    return "one_time"

def _ai(system: str, user: str, max_tokens: int = 300) -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    try:
        from anthropic import Anthropic
        msg = Anthropic(api_key=api_key).messages.create(
            model=HAIKU, max_tokens=max_tokens,
            system=system, messages=[{"role": "user", "content": user}],
        )
        return msg.content[0].text.strip()
    except Exception:
        return None


# ── Agent LLM client (OpenAI-compatible, swappable via env) ──────────────────
# LLM_BASE_URL / LLM_MODEL pick the provider; LLM_API_KEY is read from the
# environment on every call and never logged. Stdlib only, no SDK dependency.

DEFAULT_LLM_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_LLM_MODEL = "llama-3.3-70b-versatile"
LLM_MAX_RETRIES = 2        # retries on 429 / 5xx
LLM_MAX_BACKOFF_S = 8


class LLMError(Exception):
    """LLM unavailable: no key, network error, or rate-limited past our budget."""


class ToolCallError(Exception):
    """Provider rejected the model's own malformed tool call (Groq: tool_use_failed)."""


def _retry_after(headers, attempt: int) -> float:
    try:
        wait = float(headers.get("retry-after"))
    except (TypeError, ValueError):
        wait = 2 ** attempt
    return min(max(wait, 0.5), LLM_MAX_BACKOFF_S)


def _llm_chat(messages: list, tools: list = None, tool_choice: str = "auto",
              max_tokens: int = 400, deadline: float = None) -> dict:
    """One chat-completions call. Returns the assistant message dict."""
    api_key = os.getenv("LLM_API_KEY")
    if not api_key:
        raise LLMError("LLM_API_KEY not set")
    base = (os.getenv("LLM_BASE_URL") or DEFAULT_LLM_BASE_URL).rstrip("/")
    payload = {"model": os.getenv("LLM_MODEL") or DEFAULT_LLM_MODEL,
               "messages": messages, "max_tokens": max_tokens, "temperature": 0.2}
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = tool_choice
    data = json.dumps(payload).encode()
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
               "User-Agent": "datawise-agent/1.0"}

    for attempt in range(LLM_MAX_RETRIES + 1):
        remaining = deadline - time.monotonic() if deadline else 20
        if remaining < 2:
            raise LLMError("time budget exhausted")
        req = urllib.request.Request(f"{base}/chat/completions", data=data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=min(remaining, 15)) as resp:
                return json.loads(resp.read())["choices"][0]["message"]
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", "replace")[:1000]
            if e.code == 429 or e.code >= 500:
                wait = _retry_after(e.headers, attempt)
                if attempt == LLM_MAX_RETRIES or (deadline and time.monotonic() + wait > deadline - 2):
                    raise LLMError(f"HTTP {e.code} after {attempt + 1} attempt(s)")
                time.sleep(wait)
                continue
            if e.code == 400 and "tool_use_failed" in err_body:
                raise ToolCallError("malformed tool call")
            raise LLMError(f"HTTP {e.code}")
        except (urllib.error.URLError, OSError, ValueError, KeyError, IndexError) as e:
            raise LLMError(type(e).__name__)
    raise LLMError("unreachable")

def _parse_json(raw: str) -> dict | list | None:
    if not raw:
        return None
    # strip markdown fences
    if "```" in raw:
        parts = raw.split("```")
        for part in parts:
            if part.startswith("json"):
                part = part[4:]
            part = part.strip()
            if part.startswith(("[", "{")):
                try:
                    return json.loads(part)
                except Exception:
                    pass
    # try the whole thing
    try:
        return json.loads(raw.strip())
    except Exception:
        pass
    # try to extract the first [...] or {...} block
    import re
    for pat in (r'\[.*\]', r'\{.*\}'):
        m = re.search(pat, raw, re.DOTALL)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass
    return None

def _process_csv(csv_text: str, store_name: str, goal: str,
                 category: str = "other", custom_goal: str = None) -> dict:
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    rows = [{k.strip().lower().replace(" ", "_"): v for k, v in row.items()} for row in reader]

    if not rows:
        raise ValueError("CSV is empty")
    required = {"order_id", "email", "order_date", "total"}
    missing = required - set(rows[0].keys())
    if missing:
        raise ValueError(f"CSV missing columns: {missing}")

    store_id = str(uuid.uuid4())
    now = datetime.utcnow()
    customer_map: dict = {}
    customer_stats: dict = {}
    orders_list = []

    for row in rows:
        email = str(row.get("email", "")).strip().lower()
        if not email:
            continue
        order_date_raw = str(row.get("order_date", "")).strip()[:10]
        order_date = now
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
            try:
                order_date = datetime.strptime(order_date_raw, fmt)
                break
            except ValueError:
                continue

        total = _safe_float(row.get("total"))
        subtotal = _safe_float(row.get("subtotal", total))
        discount = _safe_float(row.get("discount_amount", 0))
        channel = str(row.get("channel", "organic")).lower()
        if channel not in CHANNEL_OPTIONS:
            channel = "organic"
        status = str(row.get("status", "completed")).lower()

        if email not in customer_map:
            customer_id = str(uuid.uuid4())
            customer_map[email] = customer_id
            customer_stats[email] = {
                "customer_id": customer_id, "store_id": store_id, "email": email,
                "country": str(row.get("country", "")), "city": str(row.get("city", "")),
                "first_order_date": order_date.date().isoformat(),
                "last_order_date": order_date.date().isoformat(),
                "total_orders": 0, "lifetime_value": 0.0, "segment": "one_time",
            }
        else:
            customer_id = customer_map[email]

        s = customer_stats[email]
        s["total_orders"] += 1
        s["lifetime_value"] = round(s["lifetime_value"] + total, 2)
        if order_date.date().isoformat() < s["first_order_date"]:
            s["first_order_date"] = order_date.date().isoformat()
        if order_date.date().isoformat() > s["last_order_date"]:
            s["last_order_date"] = order_date.date().isoformat()

        orders_list.append({
            "order_id": str(uuid.uuid4()), "store_id": store_id, "customer_id": customer_id,
            "order_date": order_date.isoformat(), "subtotal": subtotal,
            "discount_amount": discount, "total": total, "status": status, "channel": channel,
        })

    for s in customer_stats.values():
        last_date = datetime.strptime(s["last_order_date"], "%Y-%m-%d")
        s["segment"] = _classify_segment(s["total_orders"], (now - last_date).days)

    customers = list(customer_stats.values())
    total_revenue = sum(o["total"] for o in orders_list)
    n_orders = len(orders_list)
    aov = total_revenue / n_orders if n_orders else 0
    repeat_cust = sum(1 for c in customers if c["total_orders"] > 1)
    repeat_rate = repeat_cust / len(customers) if customers else 0

    channel_rev: dict = {}
    for o in orders_list:
        channel_rev[o["channel"]] = round(channel_rev.get(o["channel"], 0) + o["total"], 2)

    segments: dict = {}
    for c in customers:
        segments[c["segment"]] = segments.get(c["segment"], 0) + 1

    return {
        "store_id": store_id,
        "store": {
            "store_id": store_id, "name": store_name, "goal": goal,
            "category": category, "custom_goal": custom_goal, "currency": "USD",
        },
        "customers": customers, "orders": orders_list,
        "metrics": {
            "total_revenue": round(total_revenue, 2), "total_orders": n_orders,
            "aov": round(aov, 2), "repeat_rate": round(repeat_rate * 100, 1),
            "total_customers": len(customers),
            "channel_revenue": channel_rev, "segments": segments,
        },
        "rows_processed": len(rows),
    }


SAMPLE_CSV = """order_id,email,order_date,total,subtotal,discount_amount,channel,status,country,city,product_title,quantity,unit_price
ORD-001,alice@example.com,2025-01-05,89.99,99.99,10.00,organic,completed,US,New York,Running Shoes,1,89.99
ORD-002,bob@example.com,2025-01-08,45.00,45.00,0.00,paid,completed,US,Los Angeles,Yoga Mat,1,45.00
ORD-003,carol@example.com,2025-01-10,120.00,130.00,10.00,email,completed,US,Chicago,Gym Bag,1,120.00
ORD-004,alice@example.com,2025-01-20,55.00,55.00,0.00,direct,completed,US,New York,Water Bottle,2,27.50
ORD-005,dave@example.com,2025-01-22,200.00,220.00,20.00,paid,completed,CA,Toronto,Resistance Bands Set,2,100.00
ORD-006,eve@example.com,2025-02-01,35.00,35.00,0.00,organic,completed,US,Houston,Jump Rope,1,35.00
ORD-007,bob@example.com,2025-02-03,90.00,90.00,0.00,email,completed,US,Los Angeles,Running Shoes,1,90.00
ORD-008,frank@example.com,2025-02-10,75.00,80.00,5.00,paid,completed,GB,London,Foam Roller,1,75.00
ORD-009,carol@example.com,2025-02-14,60.00,60.00,0.00,organic,completed,US,Chicago,Protein Shaker,3,20.00
ORD-010,grace@example.com,2025-02-18,150.00,150.00,0.00,direct,completed,US,Phoenix,Dumbbell Set,1,150.00
ORD-011,alice@example.com,2025-02-25,110.00,120.00,10.00,email,completed,US,New York,Gym Bag,1,110.00
ORD-012,henry@example.com,2025-03-01,40.00,40.00,0.00,organic,completed,AU,Sydney,Yoga Mat,1,40.00
ORD-013,dave@example.com,2025-03-05,85.00,85.00,0.00,paid,completed,CA,Toronto,Running Shoes,1,85.00
ORD-014,eve@example.com,2025-03-10,95.00,100.00,5.00,direct,completed,US,Houston,Resistance Bands Set,1,95.00
ORD-015,irene@example.com,2025-03-12,25.00,25.00,0.00,organic,completed,US,San Diego,Jump Rope,1,25.00
ORD-016,frank@example.com,2025-03-20,130.00,130.00,0.00,email,completed,GB,London,Dumbbell Set,1,130.00
ORD-017,grace@example.com,2025-04-01,45.00,45.00,0.00,paid,completed,US,Phoenix,Foam Roller,1,45.00
ORD-018,jack@example.com,2025-04-05,180.00,200.00,20.00,organic,completed,US,Seattle,Gym Bag,1,180.00
ORD-019,irene@example.com,2025-04-08,70.00,70.00,0.00,direct,completed,US,San Diego,Water Bottle,4,17.50
ORD-020,bob@example.com,2025-04-12,55.00,55.00,0.00,paid,completed,US,Los Angeles,Protein Shaker,2,27.50
ORD-021,kate@example.com,2025-04-15,99.00,99.00,0.00,email,completed,US,Miami,Running Shoes,1,99.00
ORD-022,henry@example.com,2025-04-18,160.00,180.00,20.00,paid,completed,AU,Sydney,Dumbbell Set,1,160.00
ORD-023,jack@example.com,2025-04-22,60.00,60.00,0.00,organic,completed,US,Seattle,Yoga Mat,1,60.00
ORD-024,liam@example.com,2025-11-01,50.00,50.00,0.00,direct,completed,US,Boston,Jump Rope,2,25.00
ORD-025,mia@example.com,2025-10-15,300.00,320.00,20.00,paid,completed,US,Denver,Dumbbell Set,2,150.00"""


def _rule_based_steps(goal, metrics, customers, orders, user_context=""):
    repeat_rate = metrics.get("repeat_rate", 0)
    aov = metrics.get("aov", 0)
    total_customers = metrics.get("total_customers", 0)
    churned = sum(1 for c in customers if c.get("segment") == "churned")
    at_risk = sum(1 for c in customers if c.get("segment") == "at_risk")
    channel_revenue = metrics.get("channel_revenue", {})
    top_channel = max(channel_revenue, key=channel_revenue.get) if channel_revenue else "organic"
    ctx = f" (Note: {user_context})" if user_context else ""
    steps_map = {
        "grow_repeat_rate": [
            {"step": 1, "action": "Launch a post-purchase email sequence", "reasoning": f"Your repeat rate is {repeat_rate}%. A 3-email flow typically lifts repeat purchases 15–20%.{ctx}", "estimated_impact": "+15–20% repeat rate"},
            {"step": 2, "action": "Introduce a loyalty points programme", "reasoning": f"With {total_customers} customers, a simple points-per-dollar scheme creates a reason to return.", "estimated_impact": "+10% returning customer rate"},
            {"step": 3, "action": f"Re-engage {at_risk} at-risk customers with a discount", "reasoning": "Customers inactive 30–60 days respond well to a time-limited 10% off.", "estimated_impact": f"Recover up to {at_risk} customers"},
        ],
        "increase_aov": [
            {"step": 1, "action": "Add product bundles at checkout", "reasoning": f"Current AOV is ${aov:.2f}. Bundling 2–3 items at 10% off can lift AOV by $15–25.{ctx}", "estimated_impact": f"AOV → ${aov * 1.18:.2f}"},
            {"step": 2, "action": "Set a free-shipping threshold above your AOV", "reasoning": f"Set free shipping at ${aov * 1.25:.2f}. Customers naturally add items to qualify.", "estimated_impact": "+12% AOV"},
            {"step": 3, "action": "Upsell premium variants on product pages", "reasoning": "A side-by-side comparison converts at 5–10% and adds margin.", "estimated_impact": "+8% revenue per session"},
        ],
        "reduce_churn": [
            {"step": 1, "action": f"Win-back campaign for {churned} churned customers", "reasoning": f"A 'We miss you' email with 15% off reactivates ~8% of churned customers.{ctx}", "estimated_impact": f"Recover ~{max(1, int(churned * 0.08))} customers"},
            {"step": 2, "action": f"Early-warning alerts for {at_risk} at-risk customers", "reasoning": "Customers at 30–60 days inactive are still reachable and far cheaper to save.", "estimated_impact": "Prevent churn for 40% of at-risk segment"},
            {"step": 3, "action": "Post-churn survey to find root causes", "reasoning": "A 3-question survey identifies the top fix. One fix typically reduces churn 5–10pp.", "estimated_impact": "-5–10pp churn rate"},
        ],
        "grow_revenue": [
            {"step": 1, "action": f"Scale up {top_channel} — your highest-revenue channel", "reasoning": f"{top_channel.capitalize()} generates ${channel_revenue.get(top_channel, 0):.0f}. +20% budget here beats opening new channels.{ctx}", "estimated_impact": "+15–20% channel revenue"},
            {"step": 2, "action": "Flash sale targeting one-time buyers", "reasoning": "One-time buyers are warm but dormant. A 48-hour sale converts at 3–5x cold audience rates.", "estimated_impact": "+8–12% monthly revenue"},
            {"step": 3, "action": "Expand to a second geography", "reasoning": "You already ship internationally. Localising checkout for a second market adds 10–20% incremental revenue.", "estimated_impact": "+10–20% revenue"},
        ],
    }
    return steps_map.get(goal, steps_map["grow_revenue"])


ANALYSIS_SYSTEM = (
    "You are a PM analyst for ecommerce stores. Output exactly 3 actionable next steps as JSON: "
    '[{"step":1,"action":"...","reasoning":"...","estimated_impact":"..."}]. '
    "Be specific with numbers. Return only valid JSON array."
)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/api/ingest")
def ingest(body: IngestRequest):
    try:
        return _process_csv(body.csv_content, body.store_name, body.goal,
                            body.category, body.custom_goal)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/demo")
def demo():
    return _process_csv(SAMPLE_CSV, "Demo Store", "grow_repeat_rate",
                        "sports", None)


@app.post("/api/analysis")
def analysis(body: AnalysisRequest):
    store = body.store
    goal = store.get("goal", "grow_revenue")
    user_context = (body.user_context or "").strip()
    api_key = os.getenv("ANTHROPIC_API_KEY")

    if api_key:
        segments: dict = {}
        for c in body.customers:
            seg = c.get("segment", "unknown")
            segments[seg] = segments.get(seg, 0) + 1
        prompt = f"""Store: {store.get('name')} | Category: {store.get('category','ecommerce')} | Goal: {GOAL_LABELS.get(goal, goal)}
Metrics: Revenue=${body.metrics.get('total_revenue')}, Orders={body.metrics.get('total_orders')}, AOV=${body.metrics.get('aov')}, Repeat={body.metrics.get('repeat_rate')}%
Segments: {json.dumps(segments)} | Channel Revenue: {json.dumps(body.metrics.get('channel_revenue',{}))}
{f"Owner context: {user_context}" if user_context else ""}
Generate 3 specific next steps."""
        raw = _ai(ANALYSIS_SYSTEM, prompt, 1024)
        steps = _parse_json(raw)
        if not steps:
            steps = _rule_based_steps(goal, body.metrics, body.customers, body.orders, user_context)
    else:
        steps = _rule_based_steps(goal, body.metrics, body.customers, body.orders, user_context)

    return {"store_id": store.get("store_id"), "goal": goal, "steps": steps}


@app.post("/api/validate-goal")
def validate_goal(body: ValidateGoalRequest):
    system = ('Validate and normalize an ecommerce business goal. '
              'Return JSON: {"normalized_goal":"...","is_valid":true,"feedback":"...","suggested_key":"grow_revenue"} '
              'where normalized_goal is clear and under 8 words, suggested_key is one of: '
              'grow_repeat_rate, increase_aov, reduce_churn, grow_revenue, custom.')
    raw = _ai(system, f"Category: {body.category or 'ecommerce'}\nGoal: {body.custom_goal}", 150)
    result = _parse_json(raw)
    if not result:
        return {"normalized_goal": body.custom_goal, "is_valid": True,
                "feedback": "Got it!", "suggested_key": "custom"}
    return result


def _rule_based_answer(question: str, metrics: dict, customers: list) -> str:
    q = question.lower()
    repeat_rate = metrics.get("repeat_rate", 0)
    aov = metrics.get("aov", 0)
    total_revenue = metrics.get("total_revenue", 0)
    total_orders = metrics.get("total_orders", 0)
    churned = sum(1 for c in customers if c.get("segment") == "churned")
    at_risk = sum(1 for c in customers if c.get("segment") == "at_risk")
    channel_rev = metrics.get("channel_revenue", {})
    top_channel = max(channel_rev, key=channel_rev.get) if channel_rev else "organic"
    if any(w in q for w in ["repeat", "retention", "return"]):
        return (f"Your repeat rate is {repeat_rate}%. "
                f"{'This is below average — ' if repeat_rate < 20 else 'To improve further, '}"
                f"focus on post-purchase email flows and a loyalty programme to bring customers back.")
    if any(w in q for w in ["aov", "average order", "order value", "spend"]):
        return (f"Your average order value is ${aov:.2f}. "
                f"Adding product bundles and a free-shipping threshold at ${aov * 1.25:.2f} "
                f"are the quickest ways to push this higher.")
    if any(w in q for w in ["churn", "lost", "inactive"]):
        return (f"You have {churned} churned customers and {at_risk} at-risk. "
                f"A win-back email with 15% off typically reactivates ~8% of churned customers, "
                f"worth targeting first.")
    if any(w in q for w in ["channel", "traffic", "source", "paid", "organic", "email"]):
        return (f"Your top revenue channel is {top_channel} "
                f"(${channel_rev.get(top_channel, 0):.0f}). "
                f"Doubling down here is more efficient than opening new channels at this stage.")
    if any(w in q for w in ["revenue", "sales", "money", "growth"]):
        return (f"Total revenue is ${total_revenue:,.2f} across {total_orders} orders. "
                f"With {repeat_rate}% repeat rate and ${aov:.2f} AOV, the biggest lever is "
                f"improving repeat purchases through email retention flows.")
    return (f"Based on your data — ${total_revenue:,.2f} revenue, {repeat_rate}% repeat rate, "
            f"${aov:.2f} AOV — the highest-impact action is usually improving retention. "
            f"A post-purchase email sequence and loyalty scheme are good starting points.")


@app.post("/api/ask")
def ask(body: AskRequest):
    segments: dict = {}
    for c in body.customers:
        seg = c.get("segment", "unknown")
        segments[seg] = segments.get(seg, 0) + 1
    context = (f"Store: {body.store.get('name')} | Category: {body.store.get('category','ecommerce')}\n"
               f"Revenue: ${body.metrics.get('total_revenue')} | Orders: {body.metrics.get('total_orders')} "
               f"| AOV: ${body.metrics.get('aov')} | Repeat: {body.metrics.get('repeat_rate')}%\n"
               f"Segments: {json.dumps(segments)}")
    system = "Concise ecommerce analyst. Answer in 2-3 sentences using the store data. Be specific."
    answer = _ai(system, f"{context}\n\nQuestion: {body.question}", 200)
    if not answer:
        answer = _rule_based_answer(body.question, body.metrics, body.customers)
    return {"answer": answer}


@app.post("/api/experiment-plan")
def experiment_plan(body: ExperimentPlanRequest):
    insight = body.insight
    fallback = {
        "hypothesis": f"If we {insight.get('action','').lower()}, we expect {insight.get('estimated_impact','improvement')}",
        "steps": ["Set up and plan the implementation", "Execute the changes", "Measure results against baseline"],
        "success_metric": insight.get("estimated_impact", "Measurable improvement"),
        "duration_days": 14, "check_in_days": 3,
    }
    system = ('Create a concrete ecommerce experiment plan. '
              'Return JSON: {"hypothesis":"...","steps":["...","...","..."],'
              '"success_metric":"...","duration_days":14,"check_in_days":3}')
    prompt = (f"Action: {insight.get('action')}\n"
              f"Reasoning: {insight.get('reasoning')}\n"
              f"Expected impact: {insight.get('estimated_impact')}\n"
              f"Store: {body.store.get('name')} | Category: {body.store.get('category','ecommerce')} "
              f"| Revenue: ${body.metrics.get('total_revenue')} | Customers: {body.metrics.get('total_customers')}")
    raw = _ai(system, prompt, 350)
    result = _parse_json(raw)
    return result if result else fallback


@app.post("/api/experiment-check")
def experiment_check(body: ExperimentCheckRequest):
    fallback = {"recommendation": "Keep going — consistency is the key. Review your metrics daily and adjust if needed.",
                "encouragement": "You're making progress!", "next_check_in_days": 3}
    plan = body.experiment.get("plan", {})
    insight = body.experiment.get("insight", {})
    system = ('Encouraging ecommerce coach. Give specific advice based on progress. '
              'Return JSON: {"recommendation":"...","encouragement":"...","next_check_in_days":3}')
    prompt = (f"Experiment: {insight.get('action','')}\n"
              f"Goal: {plan.get('success_metric','')}\n"
              f"Duration: {plan.get('duration_days',14)} days\n"
              f"Progress update: {body.progress_note}")
    raw = _ai(system, prompt, 200)
    result = _parse_json(raw)
    return result if result else fallback


# ── PM Engine ─────────────────────────────────────────────────────────────────

JOURNEY_TEMPLATES = {
    "sports":      ["See ad or organic content", "Visit product listing", "View product detail", "Add to cart", "Complete first purchase", "Return for repeat purchase"],
    "clothing":    ["Discover brand via social or search", "Browse collection", "View product detail", "Add to cart", "Complete checkout", "Become a loyal repeat buyer"],
    "beauty":      ["See review or recommendation", "Browse products", "Read details / ingredients", "Add to cart", "First purchase", "Repurchase or subscribe"],
    "food":        ["See ad or menu", "Browse options", "Add items to order", "Checkout", "Receive first order", "Reorder within 30 days"],
    "home":        ["Research and compare online", "View product detail", "Add to cart", "Purchase", "Receive and use product", "Leave review or repurchase"],
    "electronics": ["Research and compare specs", "View product detail", "Add to cart", "Purchase", "Setup / onboarding", "Buy accessories or upgrade"],
    "other":       ["Discover product", "Browse and compare", "View product detail", "Add to cart", "Complete purchase", "Return to buy again"],
}

BENCHMARKS = {
    "sports":      {"repeat_rate": {"poor": 20, "median": 28, "good": 40}, "aov": {"poor": 45, "median": 65, "good": 90},  "churn_pct": {"poor": 75, "median": 60, "good": 45}},
    "clothing":    {"repeat_rate": {"poor": 25, "median": 32, "good": 42}, "aov": {"poor": 50, "median": 75, "good": 100}, "churn_pct": {"poor": 70, "median": 55, "good": 40}},
    "beauty":      {"repeat_rate": {"poor": 30, "median": 38, "good": 50}, "aov": {"poor": 35, "median": 52, "good": 75},  "churn_pct": {"poor": 65, "median": 50, "good": 35}},
    "food":        {"repeat_rate": {"poor": 35, "median": 48, "good": 60}, "aov": {"poor": 25, "median": 38, "good": 55},  "churn_pct": {"poor": 60, "median": 45, "good": 30}},
    "home":        {"repeat_rate": {"poor": 15, "median": 22, "good": 32}, "aov": {"poor": 60, "median": 95, "good": 140}, "churn_pct": {"poor": 80, "median": 65, "good": 50}},
    "electronics": {"repeat_rate": {"poor": 12, "median": 18, "good": 28}, "aov": {"poor": 80, "median": 130, "good": 200},"churn_pct": {"poor": 82, "median": 70, "good": 55}},
    "other":       {"repeat_rate": {"poor": 20, "median": 25, "good": 35}, "aov": {"poor": 40, "median": 60, "good": 85},  "churn_pct": {"poor": 75, "median": 60, "good": 45}},
}

STEP_METRIC_MAP = [
    {"keywords": ["ad", "social", "organic", "discover", "awareness", "find", "search", "see", "content", "post"],
     "metric_key": "channel_mix", "metric_label": "Acquisition channels", "available": True},
    {"keywords": ["list", "browse", "catalog", "scroll", "collection", "landing", "explore", "shop"],
     "metric_key": "channel_quality", "metric_label": "Channel quality", "available": True},
    {"keywords": ["product", "detail", "pdp", "view", "look", "read", "consider", "spec", "description"],
     "metric_key": "aov", "metric_label": "Avg order value (intent proxy)", "available": True},
    {"keywords": ["cart", "add", "basket", "wishlist"],
     "metric_key": "cart", "metric_label": "Add-to-cart rate", "available": False,
     "note": "Connect Shopify / Google Analytics to track this step"},
    {"keywords": ["buy", "purchase", "checkout", "order", "pay", "complete", "bought", "first purchase", "first order"],
     "metric_key": "conversion", "metric_label": "Orders & revenue", "available": True},
    {"keywords": ["repeat", "return", "come back", "loyal", "second", "again", "retain", "repurchase", "reorder", "subscribe"],
     "metric_key": "repeat_rate", "metric_label": "Repeat purchase rate", "available": True},
    {"keywords": ["refer", "share", "word", "recommend", "nps", "review", "rating"],
     "metric_key": "referral", "metric_label": "Referral / advocacy", "available": False,
     "note": "Requires referral or review tracking"},
]


class PMEngineRequest(BaseModel):
    store: dict
    metrics: dict
    customers: list
    orders: list
    journey_steps: list = []
    demographics: dict = {}
    long_term_goal: str = ""


def _bench_status(value, key, category):
    b = BENCHMARKS.get(category, BENCHMARKS["other"]).get(key)
    if not b:
        return "neutral"
    if value >= b["good"]:
        return "healthy"
    if value >= b["median"]:
        return "neutral"
    if value >= b["poor"]:
        return "warning"
    return "critical"


def _map_step(step_text):
    low = step_text.lower()
    for m in STEP_METRIC_MAP:
        if any(kw in low for kw in m["keywords"]):
            return m
    return None


def _journey_health(journey_steps, metrics, category):
    repeat_rate = metrics.get("repeat_rate", 0)
    aov = metrics.get("aov", 0)
    total_orders = metrics.get("total_orders", 0)
    total_revenue = metrics.get("total_revenue", 0)
    channel_rev = metrics.get("channel_revenue", {})
    segments = metrics.get("segments", {})
    total_customers = metrics.get("total_customers", 1)
    top_channel = max(channel_rev, key=channel_rev.get) if channel_rev else "organic"
    top_share = round(channel_rev.get(top_channel, 0) / max(sum(channel_rev.values()), 1) * 100)
    bench = BENCHMARKS.get(category, BENCHMARKS["other"])

    result = []
    for i, step in enumerate(journey_steps):
        m = _map_step(step)
        base = {"step": i + 1, "label": step}

        if not m:
            result.append({**base, "metric_key": "unknown", "metric_label": "—",
                           "status": "neutral", "data_available": False,
                           "insight": "No order-data metric for this step.",
                           "note": "Add analytics tracking for full funnel visibility."})
            continue

        if not m["available"]:
            result.append({**base, "metric_key": m["metric_key"], "metric_label": m["metric_label"],
                           "status": "no_data", "data_available": False,
                           "insight": "Can't measure from order data alone.",
                           "note": m.get("note", "Requires additional tracking.")})
            continue

        mk = m["metric_key"]
        if mk == "repeat_rate":
            b = bench["repeat_rate"]
            status = _bench_status(repeat_rate, "repeat_rate", category)
            gap = repeat_rate - b["median"]
            result.append({**base, "metric_key": mk, "metric_label": m["metric_label"],
                           "current_value": repeat_rate, "unit": "%",
                           "benchmark": b["median"], "benchmark_good": b["good"],
                           "status": status, "data_available": True,
                           "insight": f"{repeat_rate}% repeat rate — {'✓ above' if gap >= 0 else f'{abs(gap):.0f}pp below'} the {b['median']}% {category} benchmark."})
        elif mk == "aov":
            b = bench["aov"]
            status = _bench_status(aov, "aov", category)
            gap = aov - b["median"]
            result.append({**base, "metric_key": mk, "metric_label": m["metric_label"],
                           "current_value": round(aov, 2), "unit": "$",
                           "benchmark": b["median"], "benchmark_good": b["good"],
                           "status": status, "data_available": True,
                           "insight": f"${aov:.2f} AOV — {'✓ above' if gap >= 0 else f'${abs(gap):.0f} below'} the ${b['median']} {category} benchmark."})
        elif mk in ("channel_mix", "channel_quality"):
            diversified = top_share <= 65
            result.append({**base, "metric_key": mk, "metric_label": m["metric_label"],
                           "current_value": top_share, "unit": "% top channel",
                           "benchmark": 60, "benchmark_good": 40,
                           "status": "healthy" if diversified else "warning", "data_available": True,
                           "insight": f"Top channel: {top_channel} ({top_share}% of revenue). {'Well diversified.' if diversified else 'Consider diversifying acquisition.'}"})
        elif mk == "conversion":
            result.append({**base, "metric_key": mk, "metric_label": m["metric_label"],
                           "current_value": total_orders, "unit": "orders",
                           "benchmark": None, "status": "healthy" if total_orders > 20 else "warning",
                           "data_available": True,
                           "insight": f"{total_orders} orders, ${total_revenue:,.2f} total revenue."})
        else:
            result.append({**base, "metric_key": mk, "metric_label": m["metric_label"],
                           "status": "neutral", "data_available": False,
                           "insight": "Metric not computable from current data."})
    return result


def _north_star(goal, metrics, category):
    rr = metrics.get("repeat_rate", 0)
    aov = metrics.get("aov", 0)
    revenue = metrics.get("total_revenue", 0)
    orders = metrics.get("total_orders", 0)
    segments = metrics.get("segments", {})
    total_cust = metrics.get("total_customers", 1)
    churn_rate = round(segments.get("churned", 0) / total_cust * 100, 1)
    b = BENCHMARKS.get(category, BENCHMARKS["other"])

    if goal == "grow_repeat_rate":
        br = b["repeat_rate"]
        status = _bench_status(rr, "repeat_rate", category)
        return {"metric": "repeat_rate", "label": "Repeat Purchase Rate", "current": rr,
                "target": br["good"], "benchmark": br["median"], "unit": "%", "status": status,
                "gap_text": f"+{br['good'] - rr:.1f}pp to target" if rr < br["good"] else "✓ Above target"}
    if goal == "increase_aov":
        ba = b["aov"]
        status = _bench_status(aov, "aov", category)
        return {"metric": "aov", "label": "Avg Order Value", "current": round(aov, 2),
                "target": ba["good"], "benchmark": ba["median"], "unit": "$", "status": status,
                "gap_text": f"+${ba['good'] - aov:.0f} to target" if aov < ba["good"] else "✓ Above target"}
    if goal == "reduce_churn":
        bc = b["churn_pct"]
        status = "healthy" if churn_rate <= bc["good"] else "warning" if churn_rate <= bc["median"] else "critical"
        return {"metric": "churn_rate", "label": "Churn Rate", "current": churn_rate,
                "target": bc["good"], "benchmark": bc["median"], "unit": "%", "status": status,
                "gap_text": f"-{churn_rate - bc['good']:.1f}pp to target" if churn_rate > bc["good"] else "✓ Below target"}
    return {"metric": "total_revenue", "label": "Total Revenue", "current": revenue,
            "target": round(revenue * 1.2), "benchmark": None, "unit": "$", "status": "neutral",
            "gap_text": f"Target: ${revenue * 1.2:,.0f} (+20%)"}


def _focus_areas(journey_health_data, metrics, category):
    rr = metrics.get("repeat_rate", 0)
    aov = metrics.get("aov", 0)
    segments = metrics.get("segments", {})
    at_risk = segments.get("at_risk", 0)
    churned = segments.get("churned", 0)
    b = BENCHMARKS.get(category, BENCHMARKS["other"])
    areas = []

    if rr < b["repeat_rate"]["median"]:
        gap = b["repeat_rate"]["good"] - rr
        areas.append({"rank": 1, "area": "Post-purchase retention",
                      "problem": f"{rr}% repeat rate — {b['repeat_rate']['median'] - rr:.0f}pp below the {category} median",
                      "lever": "3-email post-purchase flow + loyalty reward on 2nd purchase",
                      "estimated_impact": f"+{min(gap, 12):.0f}pp repeat rate in 90 days",
                      "journey_step": next((s["step"] for s in journey_health_data if s.get("metric_key") == "repeat_rate"), None)})

    if aov < b["aov"]["median"]:
        areas.append({"rank": 2, "area": "Average order value",
                      "problem": f"${aov:.2f} AOV — ${b['aov']['median'] - aov:.0f} below the {category} median",
                      "lever": f"Bundle 2 items at 10% off · free shipping at ${aov * 1.25:.0f}",
                      "estimated_impact": f"+${(b['aov']['median'] - aov) * 0.5:.0f} AOV in 60 days",
                      "journey_step": next((s["step"] for s in journey_health_data if s.get("metric_key") == "aov"), None)})

    if at_risk > 0:
        areas.append({"rank": 3, "area": "At-risk customer recovery",
                      "problem": f"{at_risk} customers haven't bought in 30–60 days",
                      "lever": "Time-limited win-back email with 10–15% off",
                      "estimated_impact": f"Recover ~{max(1, int(at_risk * 0.15))} customers",
                      "journey_step": next((s["step"] for s in journey_health_data if s.get("metric_key") == "repeat_rate"), None)})

    if not areas and churned > 0:
        areas.append({"rank": 1, "area": "Churned customer reactivation",
                      "problem": f"{churned} customers lost (90d+ inactive)",
                      "lever": "'We miss you' email with 15% off",
                      "estimated_impact": f"Recover ~{max(1, int(churned * 0.08))} customers",
                      "journey_step": None})
    return areas[:3]


def _persona_insight(demographics, category):
    age_groups = demographics.get("age_groups", [])
    regions = demographics.get("regions", [])
    lines = []
    if any(a in age_groups for a in ["18-24", "25-34"]):
        lines.append("Your core 18–34 demo engages best on Instagram and TikTok — short-form video showing results converts well.")
    elif any(a in age_groups for a in ["35-44", "45-54"]):
        lines.append("35–54 buyers trust social proof and clear guarantees — invest in reviews and easy returns messaging.")
    if "UK" in regions:
        lines.append("UK buyers expect transparent delivery times and free returns — highlighting these lifts conversion ~8%.")
    elif "US" in regions:
        lines.append("US market responds to urgency (limited stock, time-limited offers) and loyalty programmes.")
    if not lines:
        lines.append(f"Focus on the channels where your {category} audience is most active. Email + SMS give the best retention ROI.")
    return " ".join(lines[:2])


@app.get("/api/journey-template/{category}")
def journey_template(category: str):
    steps = JOURNEY_TEMPLATES.get(category.lower(), JOURNEY_TEMPLATES["other"])
    return {"category": category, "steps": steps}


@app.post("/api/pm-engine")
def pm_engine(body: PMEngineRequest):
    store = body.store
    category = store.get("category", "other").lower()
    goal = store.get("goal", "grow_revenue")
    steps = body.journey_steps or JOURNEY_TEMPLATES.get(category, JOURNEY_TEMPLATES["other"])

    jh = _journey_health(steps, body.metrics, category)
    ns = _north_star(goal, body.metrics, category)
    fa = _focus_areas(jh, body.metrics, category)
    persona = _persona_insight(body.demographics, category)

    # AI enhancement if key available
    ai_summary = None
    if os.getenv("ANTHROPIC_API_KEY") and body.long_term_goal:
        system = ("You are a senior product manager for ecommerce. Given a brand's long-term goal and "
                  "current metrics, write ONE sharp sentence (max 20 words) naming the single biggest "
                  "lever to hit that goal. Be direct, no fluff.")
        prompt = (f"Brand: {store.get('name')} | Category: {category} | Goal metric: {goal}\n"
                  f"Long-term vision: {body.long_term_goal}\n"
                  f"Current: repeat={body.metrics.get('repeat_rate')}%, AOV=${body.metrics.get('aov')}, "
                  f"orders={body.metrics.get('total_orders')}, revenue=${body.metrics.get('total_revenue')}\n"
                  f"Top focus: {fa[0]['area'] if fa else 'retention'}")
        ai_summary = _ai(system, prompt, 60)

    return {
        "north_star": ns,
        "journey_health": jh,
        "focus_areas": fa,
        "persona_insight": persona,
        "ai_summary": ai_summary,
        "category": category,
        "goal": goal,
    }


handler = Mangum(app, lifespan="off")
