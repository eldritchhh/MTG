-- ============================================================
-- MTG tra amici - schema database (Supabase / Postgres)
-- Incolla tutto in Supabase > SQL Editor > New query > Run
-- Si può rieseguire anche su un database già creato: aggiunge solo ciò che manca.
-- ============================================================

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#c9a227',
  created_at timestamptz not null default now()
);

-- Tier dinamici (es. S, 1, 2): si gestiscono dall'app
create table if not exists tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#c9a227',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists decks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  commander text not null,
  partner text,
  colors text[] not null default '{}',
  tags text[] not null default '{}',
  image_url text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Soldi: "debtor deve amount a creditor"
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  debtor_id uuid not null references players(id) on delete cascade,
  creditor_id uuid not null references players(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  description text not null default '',
  settled boolean not null default false,
  created_at timestamptz not null default now()
);

-- Carte prestate / cedute
create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references players(id) on delete cascade,
  borrower_id uuid not null references players(id) on delete cascade,
  cards text not null,
  status text not null default 'prestito' check (status in ('prestito','definitivo','restituito')),
  notes text,
  created_at timestamptz not null default now()
);

-- Partite: participants = [{player_id, deck_id, final_life, eliminated_order}]
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  played_at timestamptz not null default now(),
  starting_life int not null default 40,
  winner_player_id uuid references players(id) on delete set null,
  participants jsonb not null default '[]',
  duration_min int,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Aggiornamenti (sicuri da rieseguire su un database esistente) ----------
alter table decks add column if not exists tier_id uuid references tiers(id) on delete set null;
alter table debts add column if not exists group_id uuid;
alter table debts add column if not exists group_total numeric(10,2);

insert into tiers (name, color, sort_order)
select * from (values ('S', '#e05252', 0), ('1', '#c9a227', 1), ('2', '#4f8cf0', 2)) v(name, color, sort_order)
where not exists (select 1 from tiers);

-- ---------- Accesso: solo email autorizzate ----------
-- Possono registrarsi solo le email in questa lista. Chi è admin la gestisce dall'app (Altro → Accesso).
-- La prima persona che si registra (o il primo utente già esistente) diventa admin.
create table if not exists allowed_emails (
  email text primary key check (email = lower(email)),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- utenti già registrati prima di questa lista: restano ammessi, il più vecchio diventa admin
insert into allowed_emails (email)
select lower(email) from auth.users where email is not null
on conflict do nothing;
update allowed_emails set is_admin = true
where email = (select lower(email) from auth.users where email is not null order by created_at limit 1)
  and not exists (select 1 from allowed_emails where is_admin);

create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from allowed_emails where email = lower(auth.jwt() ->> 'email'))
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from allowed_emails where email = lower(auth.jwt() ->> 'email') and is_admin)
$$;

-- blocca la registrazione di email non in lista (se la lista è vuota, il primo diventa admin)
create or replace function public.check_allowed_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from allowed_emails) then
    insert into allowed_emails (email, is_admin) values (lower(new.email), true);
  elsif not exists (select 1 from allowed_emails where email = lower(new.email)) then
    raise exception 'email non autorizzata';
  end if;
  return new;
end $$;

drop trigger if exists check_allowed_email on auth.users;
create trigger check_allowed_email before insert on auth.users
for each row execute function public.check_allowed_email();

alter table allowed_emails enable row level security;
drop policy if exists "allowed_read" on allowed_emails;
drop policy if exists "allowed_insert" on allowed_emails;
drop policy if exists "allowed_update" on allowed_emails;
drop policy if exists "allowed_delete" on allowed_emails;
create policy "allowed_read" on allowed_emails for select to authenticated using ((select public.is_allowed()));
create policy "allowed_insert" on allowed_emails for insert to authenticated with check ((select public.is_admin()));
create policy "allowed_update" on allowed_emails for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "allowed_delete" on allowed_emails for delete to authenticated using ((select public.is_admin()));

-- Sicurezza: solo utenti loggati E con email autorizzata leggono/scrivono
-- (se togli un'email dalla lista, quella persona non vede più i dati)
alter table players enable row level security;
alter table decks   enable row level security;
alter table debts   enable row level security;
alter table loans   enable row level security;
alter table games   enable row level security;
alter table tiers   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['players','decks','debts','loans','games','tiers'] loop
    execute format('drop policy if exists "amici_all" on %I', t);
    execute format('create policy "amici_all" on %I for all to authenticated using ((select public.is_allowed())) with check ((select public.is_allowed()))', t);
  end loop;
end $$;

-- Sincronizzazione in tempo reale tra i telefoni
do $$
declare t text;
begin
  foreach t in array array['players','decks','debts','loans','games','tiers'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
