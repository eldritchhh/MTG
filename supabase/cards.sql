-- ============================================================
-- MTG tra amici - CONTO CARTE tra due persone + SALDI (spec Parte 2)
-- Da lanciare DOPO schema.sql e pods.sql. Si può rieseguire (la migrazione avviene una volta sola).
--
-- card_loans        = una carta di `owner` che ha `holder` (una riga del conto). Non è un debito.
--                     open → returned (restituita) oppure settled (saldata: chi la ha la tiene)
-- settlements       = un saldo tra due persone: l'unica vera transazione
-- settlement_items  = cosa c'è nel saldo: carte tenute (kept), carte nuove date (given), soldi (money)
--                     i soldi "due" (da pagare) diventano un debito nella scheda Soldi ("Saldo carte con X")
-- card_prices       = prezzi Cardmarket via Scryfall, condivisi, al massimo uno al giorno per carta
-- Le spese (debts) non cambiano: solo il campo facoltativo settlement_id.
-- ============================================================

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references pods(id) on delete cascade,
  player_a uuid not null references players(id),
  player_b uuid not null references players(id),
  note text,
  difference_cents int not null default 0, -- valore tenuto da a − valore dato da a
  difference_resolution text not null default 'accepted' check (difference_resolution in ('accepted', 'money')),
  imported boolean not null default false, -- creato dalla migrazione dei vecchi prestiti "definitivi"
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (player_a <> player_b)
);
create index if not exists settlements_pod on settlements(pod_id);

create table if not exists card_loans (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references pods(id) on delete cascade,
  owner_player uuid not null references players(id), -- di chi è la carta
  holder_player uuid not null references players(id), -- chi ce l'ha adesso
  name text not null,
  quantity int not null default 1 check (quantity > 0),
  note text,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users(id) on delete set null default auth.uid(),
  status text not null default 'open' check (status in ('open', 'returned', 'settled')),
  closed_at timestamptz,
  settlement_id uuid references settlements(id) on delete set null,
  created_at timestamptz not null default now(),
  check (owner_player <> holder_player)
);
create index if not exists card_loans_pod on card_loans(pod_id);

create table if not exists settlement_items (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references pods(id) on delete cascade,
  settlement_id uuid not null references settlements(id) on delete cascade,
  kind text not null check (kind in ('kept', 'given', 'money')),
  loan_id uuid references card_loans(id) on delete set null, -- kept: la riga del conto che diventa definitiva
  from_player uuid not null references players(id), -- kept: proprietario; given/money: chi dà
  to_player uuid not null references players(id), -- kept: chi la tiene; given/money: chi riceve
  name text,
  quantity int not null default 1 check (quantity > 0),
  value_cents int check (value_cents is null or value_cents >= 0), -- valore unitario congelato al saldo
  value_source text check (value_source in ('scryfall', 'manual', 'none')),
  amount_cents int check (amount_cents is null or amount_cents > 0),
  mode text check (mode in ('due', 'paid_now')), -- solo soldi
  debt_id uuid references debts(id) on delete set null, -- soldi "due": il debito nella scheda Soldi
  created_at timestamptz not null default now(),
  check (from_player <> to_player)
);
create index if not exists settlement_items_settlement on settlement_items(settlement_id);

alter table debts add column if not exists settlement_id uuid references settlements(id) on delete set null;

create table if not exists card_prices (
  name text primary key, -- nome inglese in minuscolo
  eur_cents int, -- prezzo più basso tra le edizioni (Cardmarket via Scryfall); null = senza prezzo
  fetched_at timestamptz not null default now()
);
create table if not exists app_migrations (name text primary key, done_at timestamptz not null default now());

-- ---------- accesso e regole ----------
grant select, insert, update, delete on card_loans, settlements, settlement_items to authenticated;
grant select, insert, update on card_prices to authenticated;
alter table card_loans enable row level security;
alter table settlements enable row level security;
alter table settlement_items enable row level security;
alter table card_prices enable row level security;
alter table app_migrations enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname, tablename from pg_policies where schemaname = 'public'
             and tablename in ('card_loans', 'settlements', 'settlement_items', 'card_prices') loop
    execute format('drop policy %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- tutti nel pod vedono tutto; aggiungono, restituiscono e saldano le due persone coinvolte e l'admin
create policy loans_read on card_loans for select to authenticated using (public.is_member(pod_id));
create policy loans_write on card_loans for all to authenticated
  using (public.is_pod_admin(pod_id) or public.my_player(pod_id) in (owner_player, holder_player))
  with check (
    public.player_in_pod(owner_player, pod_id) and public.player_in_pod(holder_player, pod_id)
    and (public.is_pod_admin(pod_id) or public.my_player(pod_id) in (owner_player, holder_player))
  );

create policy settlements_read on settlements for select to authenticated using (public.is_member(pod_id));
create policy settlements_write on settlements for all to authenticated
  using (public.is_pod_admin(pod_id) or public.my_player(pod_id) in (player_a, player_b))
  with check (
    public.player_in_pod(player_a, pod_id) and public.player_in_pod(player_b, pod_id)
    and (public.is_pod_admin(pod_id) or public.my_player(pod_id) in (player_a, player_b))
  );

create policy items_read on settlement_items for select to authenticated using (public.is_member(pod_id));
create policy items_write on settlement_items for all to authenticated
  using (public.is_pod_admin(pod_id) or public.my_player(pod_id) in (from_player, to_player))
  with check (
    exists (select 1 from settlements s where s.id = settlement_id and s.pod_id = settlement_items.pod_id
            and from_player in (s.player_a, s.player_b) and to_player in (s.player_a, s.player_b))
    and (public.is_pod_admin(pod_id) or public.my_player(pod_id) in (from_player, to_player))
  );

create policy prices_read on card_prices for select to authenticated using (true);
create policy prices_insert on card_prices for insert to authenticated with check (true);
create policy prices_update on card_prices for update to authenticated using (true) with check (true);

do $$
declare t text;
begin
  foreach t in array array['card_loans', 'settlements', 'settlement_items'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- migrazione (una volta sola): vecchi prestiti -> conto carte ----------
-- In prestito -> righe aperte; Restituito -> restituite; Definitivo -> saldate in un saldo "importato"
-- senza contropartita (va bene così). Soldi e spese non si toccano: i saldi devono restare identici.
do $$
declare
  before jsonb;
  after jsonb;
  l record;
  s uuid;
  loan uuid;
  line text;
  m text[];
  qty int;
  nm text;
begin
  if exists (select 1 from app_migrations where name = 'cards_v1') then return; end if;

  select coalesce(jsonb_object_agg(pid, v), '{}') into before from (
    select pid, round(sum(v), 2) v from (
      select creditor_id pid, amount v from debts where not settled
      union all select debtor_id, -amount from debts where not settled
    ) x group by pid having round(sum(v), 2) <> 0
  ) y;

  for l in select * from loans order by created_at loop
    s := null;
    if l.status = 'definitivo' then
      insert into settlements (pod_id, player_a, player_b, note, difference_cents, difference_resolution, imported, created_by, created_at)
        values (l.pod_id, l.borrower_id, l.lender_id, coalesce(l.notes, 'Importato dai vecchi prestiti'), 0, 'accepted', true, null, l.created_at)
        returning id into s;
    end if;
    foreach line in array regexp_split_to_array(coalesce(l.cards, ''), E'\n') loop
      line := btrim(line);
      continue when line = '';
      m := regexp_match(line, '^(\d+)\s*[xX]?\s+(.*)$');
      if m is null then qty := 1; nm := line; else qty := greatest(1, m[1]::int); nm := m[2]; end if;
      nm := btrim(regexp_replace(regexp_replace(nm, '\s+\*[^*]*\*\s*$', ''), '\s+\([A-Za-z0-9]{2,6}\)(\s+[\w-]+)?\s*$', ''));
      insert into card_loans (pod_id, owner_player, holder_player, name, quantity, note, added_at, added_by, status, closed_at, settlement_id, created_at)
        values (l.pod_id, l.lender_id, l.borrower_id, nm, qty, l.notes, l.created_at, null,
                case l.status when 'prestito' then 'open' when 'restituito' then 'returned' else 'settled' end,
                case when l.status = 'prestito' then null else l.created_at end, s, l.created_at)
        returning id into loan;
      if s is not null then
        insert into settlement_items (pod_id, settlement_id, kind, loan_id, from_player, to_player, name, quantity, value_source, created_at)
          values (l.pod_id, s, 'kept', loan, l.lender_id, l.borrower_id, nm, qty, 'none', l.created_at);
      end if;
    end loop;
  end loop;
  delete from loans;

  select coalesce(jsonb_object_agg(pid, v), '{}') into after from (
    select pid, round(sum(v), 2) v from (
      select creditor_id pid, amount v from debts where not settled
      union all select debtor_id, -amount from debts where not settled
    ) x group by pid having round(sum(v), 2) <> 0
  ) y;
  if before is distinct from after then
    raise exception 'Migrazione annullata: i saldi cambierebbero (prima %, dopo %)', before, after;
  end if;
  insert into app_migrations (name) values ('cards_v1');
end $$;
