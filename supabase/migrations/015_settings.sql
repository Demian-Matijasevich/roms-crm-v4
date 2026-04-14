-- Settings key-value table
create table if not exists public.settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

alter table public.settings enable row level security;

create policy "settings_read_all" on public.settings for select using (true);
create policy "settings_admin_write" on public.settings for all using (true);

insert into public.settings (key, value) values ('usd_ars_rate', '1250') on conflict (key) do nothing;
