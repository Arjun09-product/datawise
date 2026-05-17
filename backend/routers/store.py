import uuid
import io
import os
from fastapi import APIRouter, HTTPException
from database import get_client
from models import Store, StoreGoalUpdate

router = APIRouter(prefix="/store", tags=["store"])


@router.post("", response_model=Store)
def create_store(store: Store):
    db = get_client()
    store.store_id = str(uuid.uuid4())
    data = store.model_dump()
    result = db.table("stores").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create store")
    return result.data[0]


@router.get("/{store_id}", response_model=dict)
def get_store(store_id: str):
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

    return {
        **store,
        "customers": customers,
        "metrics": {
            "total_revenue": round(total_revenue, 2),
            "total_orders": total_orders,
            "aov": round(aov, 2),
            "repeat_rate": round(repeat_rate * 100, 1),
            "total_customers": len(customers),
        },
    }


@router.patch("/{store_id}/goal", response_model=Store)
def update_goal(store_id: str, body: StoreGoalUpdate):
    db = get_client()
    result = db.table("stores").update({"goal": body.goal}).eq("store_id", store_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Store not found")
    return result.data[0]


@router.post("/demo", response_model=dict)
def load_demo():
    """Load sample_data.csv into memory and return a store_id."""
    import pandas as pd
    from datetime import datetime
    from routers.ingest import _safe_float, _safe_int, _classify_segment, CHANNEL_OPTIONS

    sample_path = os.path.join(os.path.dirname(__file__), "..", "..", "sample_data.csv")
    sample_path = os.path.abspath(sample_path)
    if not os.path.exists(sample_path):
        raise HTTPException(status_code=404, detail="sample_data.csv not found")

    db = get_client()
    store_id = str(uuid.uuid4())
    db.table("stores").insert({
        "store_id": store_id,
        "name": "Demo Store",
        "platform": "shopify",
        "currency": "USD",
        "timezone": "UTC",
        "goal": "grow_repeat_rate",
    }).execute()

    df = pd.read_csv(sample_path)
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    now = datetime.utcnow()
    customer_map: dict[str, str] = {}
    customer_stats: dict[str, dict] = {}
    orders_to_insert = []
    items_to_insert = []

    for _, row in df.iterrows():
        email = str(row.get("email", "")).strip().lower()
        if not email:
            continue
        order_date_raw = row.get("order_date", "")
        try:
            order_date = pd.to_datetime(order_date_raw).to_pydatetime()
        except Exception:
            order_date = now

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
                "customer_id": customer_id,
                "store_id": store_id,
                "email": email,
                "country": str(row.get("country", "")),
                "city": str(row.get("city", "")),
                "first_order_date": order_date.date().isoformat(),
                "last_order_date": order_date.date().isoformat(),
                "total_orders": 0,
                "lifetime_value": 0.0,
                "segment": "one_time",
            }
        else:
            customer_id = customer_map[email]

        stats = customer_stats[email]
        stats["total_orders"] += 1
        stats["lifetime_value"] += total
        if order_date.date().isoformat() < stats["first_order_date"]:
            stats["first_order_date"] = order_date.date().isoformat()
        if order_date.date().isoformat() > stats["last_order_date"]:
            stats["last_order_date"] = order_date.date().isoformat()

        order_id = str(uuid.uuid4())
        orders_to_insert.append({
            "order_id": order_id,
            "store_id": store_id,
            "customer_id": customer_id,
            "order_date": order_date.isoformat(),
            "subtotal": subtotal,
            "discount_amount": discount,
            "total": total,
            "status": status,
            "channel": channel,
        })

        product_title = str(row.get("product_title", row.get("product", ""))).strip()
        if product_title:
            product_id = str(uuid.uuid4())
            qty = _safe_int(row.get("quantity", 1), 1)
            unit_price = _safe_float(row.get("unit_price", total / max(qty, 1)))
            items_to_insert.append({
                "item_id": str(uuid.uuid4()),
                "order_id": order_id,
                "product_id": product_id,
                "quantity": qty,
                "unit_price": unit_price,
                "line_total": unit_price * qty,
            })

    for email, stats in customer_stats.items():
        last_date = datetime.strptime(stats["last_order_date"], "%Y-%m-%d")
        days_since = (now - last_date).days
        stats["segment"] = _classify_segment(stats["total_orders"], days_since)

    customers_to_insert = list(customer_stats.values())
    if customers_to_insert:
        db.table("customers").insert(customers_to_insert).execute()
    if orders_to_insert:
        db.table("orders").insert(orders_to_insert).execute()
    if items_to_insert:
        db.table("order_items").insert(items_to_insert).execute()

    return {
        "store_id": store_id,
        "store_name": "Demo Store",
        "goal": "grow_repeat_rate",
        "rows_processed": len(df),
    }
