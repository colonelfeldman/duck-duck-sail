-- Applied 2026-11-18 to the All Ashore Supabase project (fubiwzfddoboajjkvfph) as migration "dds_feedback".
-- Game tables are prefixed dds_. The game never writes to All Ashore core tables.
create table public.dds_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null check (char_length(btrim(message)) between 1 and 4000),
  name text check (name is null or char_length(name) <= 100),
  contact text check (contact is null or char_length(contact) <= 200),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  screen text check (screen is null or char_length(screen) <= 60),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500)
);
alter table public.dds_feedback enable row level security;
revoke all on public.dds_feedback from anon, authenticated;
grant insert on public.dds_feedback to anon, authenticated;
create policy "dds_feedback anon insert" on public.dds_feedback for insert to anon, authenticated with check (true);
-- Read submissions (service role / dashboard only):
--   select created_at, app_version, screen, name, contact, message from dds_feedback order by created_at desc;
