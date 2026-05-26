-- Add yesterday + ytd period columns to tiendanube_snapshots
alter table tiendanube_snapshots
  add column if not exists summary_yesterday jsonb,
  add column if not exists summary_ytd       jsonb;
