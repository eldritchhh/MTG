-- Simula quello che Supabase ha già: ruoli, schema auth con auth.uid(), pubblicazione del tempo reale.
-- Solo per i test (scripts/test-sql.sh), mai sul database vero.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;
create schema if not exists auth;
grant usage on schema auth to authenticated, anon;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now());
alter table auth.users add column if not exists raw_user_meta_data jsonb; -- signUp(options.data): qui arriva il codice invito
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to authenticated, anon;
do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;
