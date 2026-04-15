-- Table to log incoming iClosed webhook events (for debugging + replay)
create table if not exists public.iclosed_events (
  id uuid primary key default gen_random_uuid(),
  event_type text,
  payload jsonb,
  headers jsonb,
  received_at timestamptz default now(),
  processed boolean default false,
  process_error text
);

create index if not exists iclosed_events_received_at_idx on public.iclosed_events(received_at desc);
create index if not exists iclosed_events_processed_idx on public.iclosed_events(processed);

alter table public.iclosed_events enable row level security;
create policy "iclosed_events_admin_read" on public.iclosed_events for select using (true);
