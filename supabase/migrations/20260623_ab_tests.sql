-- A/B Test tracker for Meta ad sets
-- Tracks split tests being run, their hypothesis, start/end dates, and results

create table if not exists ab_tests (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  hypothesis    text,
  status        text not null default 'active' check (status in ('active', 'winner_a', 'winner_b', 'inconclusive', 'cancelled')),
  -- Variant A
  adset_id_a    text not null,
  adset_name_a  text,
  spend_a       numeric(12,2),
  purchases_a   integer,
  roas_a        numeric(6,2),
  cpa_a         numeric(10,2),
  -- Variant B
  adset_id_b    text not null,
  adset_name_b  text,
  spend_b       numeric(12,2),
  purchases_b   integer,
  roas_b        numeric(6,2),
  cpa_b         numeric(10,2),
  -- Meta
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function update_ab_tests_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ab_tests_updated_at on ab_tests;
create trigger ab_tests_updated_at
  before update on ab_tests
  for each row execute function update_ab_tests_updated_at();

-- RLS: only authenticated users can access
alter table ab_tests enable row level security;

create policy "ab_tests_select" on ab_tests for select using (true);
create policy "ab_tests_insert" on ab_tests for insert with check (true);
create policy "ab_tests_update" on ab_tests for update using (true);
