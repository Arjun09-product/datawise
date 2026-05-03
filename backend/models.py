from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime


class Store(BaseModel):
    store_id: Optional[str] = None
    name: str
    category: Optional[str] = None
    platform: Optional[str] = "shopify"
    currency: Optional[str] = "USD"
    timezone: Optional[str] = "UTC"
    goal: Optional[str] = None


class Customer(BaseModel):
    customer_id: Optional[str] = None
    store_id: str
    email: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    first_order_date: Optional[date] = None
    last_order_date: Optional[date] = None
    total_orders: Optional[int] = 0
    lifetime_value: Optional[float] = 0.0
    segment: Optional[str] = None


class Order(BaseModel):
    order_id: Optional[str] = None
    store_id: str
    customer_id: Optional[str] = None
    order_date: Optional[datetime] = None
    subtotal: Optional[float] = 0.0
    discount_amount: Optional[float] = 0.0
    total: Optional[float] = 0.0
    status: Optional[str] = "completed"
    channel: Optional[str] = None


class Product(BaseModel):
    product_id: Optional[str] = None
    store_id: str
    title: str
    category: Optional[str] = None
    price: Optional[float] = 0.0
    inventory: Optional[int] = 0
    total_sold: Optional[int] = 0
    return_rate: Optional[float] = 0.0


class OrderItem(BaseModel):
    item_id: Optional[str] = None
    order_id: str
    product_id: str
    quantity: int = 1
    unit_price: float = 0.0
    line_total: float = 0.0


class StoreGoalUpdate(BaseModel):
    goal: str


class AnalysisStep(BaseModel):
    step: int
    action: str
    reasoning: str
    estimated_impact: str


class AnalysisResponse(BaseModel):
    store_id: str
    goal: str
    steps: list[AnalysisStep]
