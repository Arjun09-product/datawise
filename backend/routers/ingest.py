import uuid
import io
from datetime import datetime, timedelta
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
import pandas as pd
from database import get_client

router = APIRouter(prefix="/ingest", tags=["ingest"])

CHANNEL_OPTIONS = ["organic", "paid", "email", "direct"]
SEGMENT_THRESHOLDS = {"repeat": 2, "at_risk_days": 30, "churned_days": 90}


def _safe_float(val, default=0.0):
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _safe_int(val, default=0):
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return default


def _classify_segment(total_orders: int, days_since_last: int) -> str:
    if total_orders >= 2:
        return "repeat"
    if days_since_last >= SEGMENT_THRESHOLDS["churned_days"]:
        return "churned"
    if days_since_last >= SEGMENT_THRESHOLDS["at_risk_days"]:
        return "at_risk"
    return "one_time"


@router.post("/csv")
async def ingest_csv(
    file: UploadFile = File(...),
    store_name: str = Form(...),
    goal: str = Form(...),
):
    db = get_client()
    store_id = str(uuid.uuid4())

    # Create store
    store_data = {
        "store_id": store_id,
        "name": store_name,
        "platform": "shopify",
        "currency": "USD",
        "timezone": "UTC",
        "goal": goal,
    }
    db.table("stores").insert(store_data).execute()

    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {e}")

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    now = datetime.utcnow()
    customer_map: dict[str, str] = {}
    customer_stats: dict[str, dict] = {}
    orders_to_insert = []
    items_to_insert = []

    required = {"order_id", "email", "order_date", "total"}
    missing = required - set(df.columns)
    if missing:
        raise HTTPException(status_code=400, detail=f"CSV missing columns: {missing}")

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

        # Upsert customer
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

        # Optional order items
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

    # Classify segments before insert
    for email, stats in customer_stats.items():
        last_date = datetime.strptime(stats["last_order_date"], "%Y-%m-%d")
        days_since = (now - last_date).days
        stats["segment"] = _classify_segment(stats["total_orders"], days_since)

    # Batch insert
    customers_to_insert = list(customer_stats.values())

    if customers_to_insert:
        db.table("customers").insert(customers_to_insert).execute()
    if orders_to_insert:
        db.table("orders").insert(orders_to_insert).execute()
    if items_to_insert:
        db.table("order_items").insert(items_to_insert).execute()

    return {
        "store_id": store_id,
        "rows_processed": len(df),
        "customers_created": len(customers_to_insert),
        "orders_created": len(orders_to_insert),
    }
