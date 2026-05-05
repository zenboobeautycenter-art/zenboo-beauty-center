create table if not exists public.zenboo_app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.zenboo_app_state enable row level security;

drop policy if exists "service role can manage zenboo app state" on public.zenboo_app_state;

create policy "service role can manage zenboo app state"
on public.zenboo_app_state
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
