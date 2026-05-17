import os
import json
from fastapi import APIRouter, HTTPException
from database import get_client
from models import AnalysisResponse, AnalysisStep

router = APIRouter(prefix="/analysis", tags=["analysis"])

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


def _rule_based_steps(goal: str, metrics: dict, customers: list, orders: list) -> list[AnalysisStep]:
    repeat_rate = metrics.get("repeat_rate", 0)
    aov = metrics.get("aov", 0)
    total_customers = metrics.get("total_customers", 0)
    churned = sum(1 for c in customers if c.get("segment") == "churned")
    at_risk = sum(1 for c in customers if c.get("segment") == "at_risk")

    channel_revenue: dict[str, float] = {}
    for o in orders:
        ch = o.get("channel", "unknown")
        channel_revenue[ch] = channel_revenue.get(ch, 0) + (o.get("total") or 0)
    top_channel = max(channel_revenue, key=channel_revenue.get) if channel_revenue else "organic"

    steps_map = {
        "grow_repeat_rate": [
            AnalysisStep(step=1, action="Launch a post-purchase email sequence", reasoning=f"Your repeat rate is {repeat_rate}%. A 3-email sequence (thank you → product tips → reorder offer) typically lifts repeat purchases by 15–20%.", estimated_impact="+15–20% repeat rate"),
            AnalysisStep(step=2, action="Introduce a loyalty points programme", reasoning=f"With {total_customers} customers, even a simple points-per-dollar scheme creates a reason to return. Aim to convert one-time buyers first.", estimated_impact="+10% returning customer rate"),
            AnalysisStep(step=3, action=f"Re-engage the {at_risk} at-risk customers with a discount", reasoning="Customers inactive for 30–60 days respond well to a time-limited 10% off coupon. Act before they hit the churned threshold.", estimated_impact=f"Recover up to {at_risk} customers"),
        ],
        "increase_aov": [
            AnalysisStep(step=1, action="Add product bundles at checkout", reasoning=f"Current AOV is ${aov:.2f}. Bundling 2–3 complementary items at a 10% discount can lift AOV by $15–25.", estimated_impact=f"AOV → ${aov * 1.18:.2f}"),
            AnalysisStep(step=2, action="Introduce a free-shipping threshold above current AOV", reasoning=f"Set free shipping at ${aov * 1.25:.2f} (25% above AOV). Customers naturally add items to qualify.", estimated_impact="+12% AOV"),
            AnalysisStep(step=3, action="Upsell premium variants on product pages", reasoning="Display a 'upgrade to pro' option alongside the standard SKU. Conversion on upsells is typically 5–10%.", estimated_impact="+8% revenue per session"),
        ],
        "reduce_churn": [
            AnalysisStep(step=1, action=f"Send a win-back campaign to {churned} churned customers", reasoning="Churned customers (90d+ inactive) still have brand awareness. A personalised 'We miss you' email with 15% off reactivates ~8% of them.", estimated_impact=f"Recover ~{max(1, int(churned * 0.08))} customers"),
            AnalysisStep(step=2, action=f"Set up early-warning alerts for {at_risk} at-risk customers", reasoning="Customers at 30–60 days inactive are still reachable. A targeted SMS or email now is far cheaper than a win-back later.", estimated_impact="Prevent churn for up to 40% of at-risk segment"),
            AnalysisStep(step=3, action="Survey recently churned customers to find root causes", reasoning="A 3-question post-churn survey (price / product / experience) reveals the biggest fix to prioritise. One fix can reduce churn rate by 5–10pp.", estimated_impact="-5–10pp churn rate"),
        ],
        "grow_revenue": [
            AnalysisStep(step=1, action=f"Double down on your top channel: {top_channel}", reasoning=f"{top_channel.capitalize()} is already your highest-revenue channel at ${channel_revenue.get(top_channel, 0):.0f}. Increasing its budget by 20% is lower risk than expanding new channels.", estimated_impact="+15–20% channel revenue"),
            AnalysisStep(step=2, action="Run a flash sale to the one-time buyer segment", reasoning="One-time buyers are warm but dormant. A 48-hour sale converts them at 3–5x the rate of cold audiences and lifts monthly revenue.", estimated_impact="+8–12% monthly revenue"),
            AnalysisStep(step=3, action="Expand to a second geography", reasoning=f"You have customers in multiple countries. Localising checkout currency and shipping for a second market can add 10–20% incremental revenue.", estimated_impact="+10–20% revenue"),
        ],
    }

    return steps_map.get(goal, steps_map["grow_revenue"])


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

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if api_key:
        from anthropic import Anthropic
        ai_client = Anthropic(api_key=api_key)
        user_prompt = _build_user_prompt(store, metrics, customers, orders)
        message = ai_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        raw = message.content[0].text.strip()
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
    else:
        steps = _rule_based_steps(store.get("goal", "grow_revenue"), metrics, customers, orders)

    return AnalysisResponse(store_id=store_id, goal=store.get("goal", ""), steps=steps)
