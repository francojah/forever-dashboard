-- app_config: general key/value config store (tokens, credentials, etc.)
create table if not exists app_config (
  key        text primary key,
  value      jsonb not null default '{}',
  updated_at timestamp with time zone default now()
);

-- Enable RLS (only service role can access)
alter table app_config enable row level security;

-- No public access — only server-side via service role key
