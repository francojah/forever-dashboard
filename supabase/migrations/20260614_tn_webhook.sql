-- Webhook events from Tiendanube (order/paid, etc.)
-- Optional table — webhook still works if this doesn't exist (silently skips the insert)

create table if not exists tn_webhook_events (
  id          bigserial primary key,
  order_id    bigint not null,
  event_type  text not null,
  revenue     numeric(12, 2),
  status      text,
  payload     jsonb,
  created_at  timestamp with time zone default now(),

  unique (order_id, event_type)
);

alter table tn_webhook_events enable row level security;

-- Service role can read and insert
create policy "service_full" on tn_webhook_events
  for all using (true) with check (true);

-- Index for recent events
create index if not exists tn_webhook_events_created_at_idx
  on tn_webhook_events (created_at desc);
