-- Run this in Supabase SQL editor

create table if not exists stores (
  store_id   text primary key,
  name       text not null,
  category   text,
  platform   text default 'shopify',
  currency   text default 'USD',
  timezone   text default 'UTC',
  goal       text
);

create table if not exists customers (
  customer_id      text primary key,
  store_id         text references stores(store_id) on delete cascade,
  email            text,
  country          text,
  city             text,
  first_order_date date,
  last_order_date  date,
  total_orders     int default 0,
  lifetime_value   numeric default 0,
  segment          text
);

create table if not exists orders (
  order_id        text primary key,
  store_id        text references stores(store_id) on delete cascade,
  customer_id     text references customers(customer_id),
  order_date      timestamptz,
  subtotal        numeric default 0,
  discount_amount numeric default 0,
  total           numeric default 0,
  status          text default 'completed',
  channel         text
);

create table if not exists products (
  product_id  text primary key,
  store_id    text references stores(store_id) on delete cascade,
  title       text not null,
  category    text,
  price       numeric default 0,
  inventory   int default 0,
  total_sold  int default 0,
  return_rate numeric default 0
);

create table if not exists order_items (
  item_id    text primary key,
  order_id   text references orders(order_id) on delete cascade,
  product_id text references products(product_id),
  quantity   int default 1,
  unit_price numeric default 0,
  line_total  numeric default 0
);
