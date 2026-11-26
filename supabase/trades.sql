-- ============================================================
-- MTG tra amici - SCAMBI UNIFICATI (carte + soldi) con valore delle carte
-- Da lanciare DOPO schema.sql e pods.sql. Si può rieseguire (la migrazione dei dati avviene una volta sola).
--
-- trade        = scambio tra due giocatori del pod
-- trade_lines  = righe: carte (con stato per riga: in prestito / definitiva / restituita / persa)
--                oppure soldi (counts_in_balance = entra nei saldi "chi deve a chi")
-- card_prices  = prezzi Cardmarket (via Scryfall) condivisi da tutti, aggiornati al massimo una volta al giorno
-- Le spese divise restano nella tabella debts.
-- ============================================================

create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references pods(id) on delete cascade,
  player_a uuid not null references players(id),
  player_b uuid not null references players(id),
  note text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (player_a <> player_b)
);
create index if not exists trades_pod on trades(pod_id);

create table if not exists trade_lines (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references pods(id) on delete cascade,
  trade_id uuid not null references trades(id) on delete cascade,
  from_player uuid not null references players(id),
  to_player uuid not null references players(id),
  kind text not null check (kind in ('card', 'money')),
  -- carte
  status text check (status in ('loan', 'permanent', 'returned', 'lost')),
  name text,
  quantity int not null default 1 check (quantity > 0),
  value_cents int check (value_cents is null or value_cents >= 0), -- valore unitario concordato (snapshot)
  value_source text check (value_source in ('scryfall', 'manual', 'none')),
  valued_at timestamptz,
  returned_at timestamptz,
  -- soldi: from_player deve dare (o ha dato) amount a to_player
  amount_cents int check (amount_cents is null or amount_cents > 0),
  counts_in_balance boolean not null default false, -- true = entra nei saldi ("chi deve a chi")
  settled boolean not null default false, -- saldato con "Pagato"
  linked_line_id uuid references trade_lines(id) on delete set null, -- es. pagamento di una carta tenuta
  created_at timestamptz not null default now(),
  check (from_player <> to_player),
  check ((kind = 'card' and name is not null and status is not null) or (kind = 'money' and amount_cents is not null))
);
create index if not exists trade_lines_trade on trade_lines(trade_id);
create index if not exists trade_lines_pod on trade_lines(pod_id);

create table if not exists card_prices (
  name text primary key, -- nome inglese della carta
  eur_cents int, -- prezzo più basso tra le edizioni (Cardmarket via Scryfall); null = senza prezzo
  fetched_at timestamptz not null default now()
);

create table if not exists app_migrations (name text primary key, done_at timestamptz not null default now());

-- ---------- accesso e regole ----------
grant select, insert, update, delete on trades, trade_lines to authenticated;
grant select, insert, update on card_prices to authenticated;
alter table trades enable row level security;
alter table trade_lines enable row level security;
alter table card_prices enable row level security;
alter table app_migrations enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('trades', 'trade_lines', 'card_prices') loop
    execute format('drop policy %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- tutti nel pod vedono tutto; scrivono le due parti coinvolte e l'admin
create policy trades_read on trades for select to authenticated using (public.is_member(pod_id));
create policy trades_write on trades for all to authenticated
  using (public.is_pod_admin(pod_id) or public.my_player(pod_id) in (player_a, player_b))
  with check (
    public.player_in_pod(player_a, pod_id) and public.player_in_pod(player_b, pod_id)
    and (public.is_pod_admin(pod_id) or public.my_player(pod_id) in (player_a, player_b))
  );

create policy lines_read on trade_lines for select to authenticated using (public.is_member(pod_id));
create policy lines_write on trade_lines for all to authenticated
  using (public.is_pod_admin(pod_id) or public.my_player(pod_id) in (from_player, to_player))
  with check (
    exists (select 1 from trades t where t.id = trade_id and t.pod_id = trade_lines.pod_id
            and from_player in (t.player_a, t.player_b) and to_player in (t.player_a, t.player_b))
    and (public.is_pod_admin(pod_id) or public.my_player(pod_id) in (from_player, to_player))
  );

-- i prezzi sono dati pubblici di Scryfall: chiunque abbia fatto login li legge e li aggiorna
create policy prices_read on card_prices for select to authenticated using (true);
create policy prices_insert on card_prices for insert to authenticated with check (true);
create policy prices_update on card_prices for update to authenticated using (true) with check (true);

do $$
declare t text;
begin
  foreach t in array array['trades', 'trade_lines'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- migrazione (una volta sola): debiti tra due persone e prestiti -> scambi ----------
do $$
declare
  before jsonb;
  after jsonb;
  d record;
  l record;
  t uuid;
  line text;
  m text[];
  qty int;
  nm text;
begin
  if exists (select 1 from app_migrations where name = 'trades_v1') then return; end if;

  -- saldi prima: debiti non saldati (creditore +, debitore -)
  select coalesce(jsonb_object_agg(pid, v), '{}') into before from (
    select pid, round(sum(v), 2) v from (
      select creditor_id pid, amount v from debts where not settled
      union all select debtor_id, -amount from debts where not settled
    ) x group by pid having round(sum(v), 2) <> 0
  ) y;

  -- debiti tra due persone (anche i "Pagamento") -> scambio con una riga soldi che entra nei saldi
  for d in select * from debts where group_id is null loop
    insert into trades (pod_id, player_a, player_b, note, created_by, created_at)
      values (d.pod_id, d.debtor_id, d.creditor_id, nullif(btrim(d.description), ''), null, d.created_at) returning id into t;
    insert into trade_lines (pod_id, trade_id, from_player, to_player, kind, amount_cents, counts_in_balance, settled, created_at)
      values (d.pod_id, t, d.debtor_id, d.creditor_id, 'money', round(d.amount * 100), true, d.settled, d.created_at);
    delete from debts where id = d.id;
  end loop;

  -- prestiti -> scambio con una riga per carta (lo stato si copia su ogni riga; valore da calcolare)
  for l in select * from loans loop
    insert into trades (pod_id, player_a, player_b, note, created_by, created_at)
      values (l.pod_id, l.lender_id, l.borrower_id, l.notes, null, l.created_at) returning id into t;
    foreach line in array regexp_split_to_array(coalesce(l.cards, ''), E'\n') loop
      line := btrim(line);
      continue when line = '';
      m := regexp_match(line, '^(\d+)\s*[xX]?\s+(.*)$');
      if m is null then qty := 1; nm := line; else qty := greatest(1, m[1]::int); nm := m[2]; end if;
      nm := btrim(regexp_replace(regexp_replace(nm, '\s+\*[^*]*\*\s*$', ''), '\s+\([A-Za-z0-9]{2,6}\)(\s+[\w-]+)?\s*$', ''));
      insert into trade_lines (pod_id, trade_id, from_player, to_player, kind, status, name, quantity, value_source, returned_at, created_at)
        values (l.pod_id, t, l.lender_id, l.borrower_id, 'card',
                case l.status when 'prestito' then 'loan' when 'definitivo' then 'permanent' else 'returned' end,
                nm, qty, 'none', case when l.status = 'restituito' then now() end, l.created_at);
    end loop;
  end loop;
  delete from loans;

  -- saldi dopo: spese divise + righe soldi che entrano nei saldi e non sono saldate
  select coalesce(jsonb_object_agg(pid, v), '{}') into after from (
    select pid, round(sum(v), 2) v from (
      select creditor_id pid, amount v from debts where not settled
      union all select debtor_id, -amount from debts where not settled
      union all select to_player, amount_cents / 100.0 from trade_lines where kind = 'money' and counts_in_balance and not settled
      union all select from_player, -amount_cents / 100.0 from trade_lines where kind = 'money' and counts_in_balance and not settled
    ) x group by pid having round(sum(v), 2) <> 0
  ) y;

  if before is distinct from after then
    raise exception 'Migrazione annullata: i saldi cambierebbero (prima %, dopo %)', before, after;
  end if;
  insert into app_migrations (name) values ('trades_v1');
  raise notice 'Migrazione scambi completata, saldi invariati: %', after;
end $$;
