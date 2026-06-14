-- ============================================================
-- Multi-brand architecture — Phase 1 (schema foundation)
-- ============================================================
-- Supports multiple Ecommerce brands, each with their own:
--   • Meta Ads account + access token
--   • Tiendanube store + access token
--   • Independent settings (breakeven CPA, ROAS min, etc.)
--   • Isolated snapshots and alerts
--
-- Phase 2 (not yet implemented):
--   • Encrypt tokens at rest with pgsodium / Vault
--   • Row-Level Security so each user sees only their brands
--   • Multi-tenant snapshot tables with brand_id FK
-- ============================================================

-- brands: one row per ecommerce brand / client
create table if not exists brands (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,                     -- "Forever Basics", "Otra Marca", ...
  slug                    text unique not null,              -- "forever-basics" (used in URLs)

  -- Meta Ads connection
  meta_account_id         text,                             -- act_XXXXXXX
  meta_access_token       text,                             -- long-lived token (encrypt in Phase 2)
  meta_token_expires_at   timestamp with time zone,

  -- Tiendanube connection
  tn_user_id              text,
  tn_access_token         text,                             -- (encrypt in Phase 2)
  tn_app_id               text default '30221',

  -- Brand-specific performance settings
  settings                jsonb not null default '{
    "breakeven_cpa": 17500,
    "roas_min": 2.86,
    "currency": "ARS",
    "margin_pct": 48,
    "avg_ticket": 50000
  }'::jsonb,

  -- Metadata
  active                  boolean not null default true,
  created_at              timestamp with time zone default now(),
  updated_at              timestamp with time zone default now()
);

-- user_brands: many-to-many junction (one user can manage many brands)
create table if not exists user_brands (
  user_id   uuid not null references auth.users(id) on delete cascade,
  brand_id  uuid not null references brands(id) on delete cascade,
  role      text not null default 'viewer',  -- 'owner' | 'editor' | 'viewer'
  primary key (user_id, brand_id)
);

-- Index for fast brand lookups per user
create index if not exists user_brands_user_idx on user_brands(user_id);
create index if not exists user_brands_brand_idx on user_brands(brand_id);

-- Auto-update updated_at on brands
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists brands_updated_at on brands;
create trigger brands_updated_at
  before update on brands
  for each row execute function update_updated_at_column();

-- Enable RLS
alter table brands enable row level security;
alter table user_brands enable row level security;

-- RLS policies: users can only see brands they belong to
create policy "Users see their brands"
  on brands for select
  using (
    id in (select brand_id from user_brands where user_id = auth.uid())
  );

create policy "Owners can update their brands"
  on brands for update
  using (
    id in (select brand_id from user_brands where user_id = auth.uid() and role = 'owner')
  );

create policy "Users see their user_brands rows"
  on user_brands for select
  using (user_id = auth.uid());

-- Seed: insert Forever Basics as the first brand (run manually after migration)
-- insert into brands (name, slug, meta_account_id, tn_user_id, settings)
-- values (
--   'Forever Basics',
--   'forever-basics',
--   'act_1614288152915913',
--   '<TN_USER_ID>',
--   '{"breakeven_cpa": 17500, "roas_min": 2.86, "currency": "ARS", "margin_pct": 48, "avg_ticket": 50000}'
-- );
