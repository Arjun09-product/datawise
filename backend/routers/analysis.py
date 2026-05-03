import os
import json
from fastapi import APIRouter, HTTPException
from anthropic import Anthropic
from database import get_client
from models import AnalysisResponse, AnalysisStep

router = APIRouter(prefix="/analysis", tags=["analysis"])

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = (
    "You are a PM analyst for ecommerce stores. Given store data and owner goal, "
    "output exactly 3 actionable next steps as JSON: "
    '[{"step": 1, "action": "...", "reasoning": "...", "estimated_impact": "..."}]. '
    "Be specific with numbers. No fluff. Return only valid JSON array."
)


def _build_user_prompt(store: dict, metrics: dict, customers: list, orders: list) -> str:
    segments: dict[str, int] = {}
    for c in customers:
        seg = c.get("segment", "unknown")
        segments[seg] = segments.get(seg, 0) + 1

    channel_revenue: dict[str, float] = {}
    for o in orders:
        ch = o.get("channel", "unknown")
        channel_revenue[ch] = channel_revenue.get(ch, 0) + (o.get("total") or 0)

    return f"""
Store: {store.get('name')} | Goal: {store.get('goal')}
Category: {store.get('category', 'ecommerce')} | Currency: {store.get('currency', 'USD')}

Metrics:
- Total Revenue: {metrics.get('total_revenue')}
- Total Orders: {metrics.get('total_orders')}
- AOV: {metrics.get('aov')}
- Repeat Rate: {metrics.get('repeat_rate')}%
- Total Customers: {metrics.get('total_customers')}

Customer Segments:
{json.dumps(segments, indent=2)}

Channel Revenue:
{json.dumps({k: round(v, 2) for k, v in channel_revenue.items()}, indent=2)}

Generate 3 specific, numbered next steps to help achieve the goal.
""".strip()


@router.get("/{store_id}", response_model=AnalysisResponse)
def get_analysis(store_id: str):
    db = get_client()

    store_result = db.table("stores").select("*").eq("store_id", store_id).execute()
    if not store_result.data:
        raise HTTPException(status_code=404, detail="Store not found")
    store = store_result.data[0]

    orders = db.table("orders").select("*").eq("store_id", store_id).execute().data or []
    customers = db.table("customers").select("*").eq("store_id", store_id).execute().data or []

    total_revenue = sum(o.get("total", 0) for o in orders)
    total_orders = len(orders)
    aov = total_revenue / total_orders if total_orders else 0
    repeat_customers = sum(1 for c in customers if (c.get("total_orders") or 0) > 1)
    repeat_rate = repeat_customers / len(customers) if customers else 0

    metrics = {
        "total_revenue": round(total_revenue, 2),
        "total_orders": total_orders,
        "aov": round(aov, 2),
        "repeat_rate": round(repeat_rate * 100, 1),
        "total_customers": len(customers),
    }

    user_prompt = _build_user_prompt(store, metrics, customers, orders)

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        steps_data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Claude returned invalid JSON")

    steps = [AnalysisStep(**s) for s in steps_data]

    return AnalysisResponse(store_id=store_id, goal=store.get("goal", ""), steps=steps)
