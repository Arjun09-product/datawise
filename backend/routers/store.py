import uuid
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
