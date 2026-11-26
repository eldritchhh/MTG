-- ============================================================
-- MTG tra amici - schema database (Supabase / Postgres)
-- Incolla tutto in Supabase > SQL Editor > New query > Run, poi fai lo stesso con pods.sql (gruppi e permessi)
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
alter table decks add column if not exists partner_image_url text;
-- giocatore "eliminato": sparisce dalle liste ma partite, debiti e scambi restano
alter table players add column if not exists archived boolean not null default false;

-- I tier di partenza (S, 1, 2) li crea ogni gruppo quando nasce (create_pod in pods.sql).

-- Lista di email autorizzate usata prima dei gruppi: resta solo perché pods.sql sappia chi era admin
-- quando sposta i dati esistenti nel primo gruppo. L'app non la legge più.
create table if not exists allowed_emails (
  email text primary key check (email = lower(email)),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table allowed_emails enable row level security;

-- Accesso dell'app alle tabelle (i progetti Supabase recenti non lo danno più in automatico);
-- cosa può vedere e modificare ciascuno lo decidono le regole RLS qui sotto e in pods.sql
grant usage on schema public to authenticated;
grant select, insert, update, delete on players, tiers, decks, debts, loans, games to authenticated;

-- Sicurezza: tutte le tabelle sono protette; i permessi (chi vede e modifica cosa) sono in pods.sql
alter table players enable row level security;
alter table decks   enable row level security;
alter table debts   enable row level security;
alter table loans   enable row level security;
alter table games   enable row level security;
alter table tiers   enable row level security;

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
