-- ============================================================
-- MTG tra amici - GRUPPI ("pod") con ruoli admin / user
-- Da lanciare DOPO schema.sql (SQL Editor > New query > Run). Si può rieseguire.
--
-- - chiunque si registra può creare un gruppo (ne diventa admin) o entrarci con un codice invito
-- - ogni dato (giocatori, tier, mazzi, partite, debiti, carte) appartiene a un gruppo
-- - tutti i membri vedono tutto il loro gruppo
-- - user: modifica solo il proprio giocatore e i propri mazzi; registra partite e scambi
--   in cui è coinvolto (e modifica solo quelli); admin: tutto
-- - i dati esistenti finiscono nel gruppo "Il nostro gruppo", con admin chi era admin
-- ============================================================

-- ---------- tabelle ----------
create table if not exists pods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- colore del gruppo (badge e barra in alto nell'app): a rotazione da una palette ben distinguibile sul nero
alter table pods add column if not exists color text;
create or replace function public.pod_color(n bigint) returns text
language sql immutable as $$
  select (array['#d9b45a','#4f8cf0','#45b26b','#e05252','#a35ee0','#e0843a','#3ab8c4','#e05ea8'])[1 + (n % 8)::int]
$$;
update pods p set color = public.pod_color(x.n)
from (select id, row_number() over (order by created_at) - 1 as n from pods) x
where p.id = x.id and p.color is null;

create table if not exists pod_members (
  pod_id uuid not null references pods(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  player_id uuid references players(id) on delete set null, -- "chi sono" in questo gruppo
  joined_at timestamptz not null default now(),
  primary key (pod_id, user_id)
);
-- email del membro: la vede solo chi è nello stesso gruppo (serve all'admin per riconoscere chi è chi)
alter table pod_members add column if not exists email text;
create unique index if not exists pod_members_one_user_per_player on pod_members(player_id) where player_id is not null;
create index if not exists pod_members_user on pod_members(user_id);

create table if not exists pod_invites (
  code text primary key,
  pod_id uuid not null references pods(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  uses_left int not null default 20 check (uses_left >= 0),
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['players','tiers','decks','debts','loans','games'] loop
    execute format('alter table %I add column if not exists pod_id uuid references pods(id) on delete cascade', t);
    execute format('create index if not exists %I on %I(pod_id)', t || '_pod', t);
  end loop;
end $$;

-- ---------- dati esistenti -> primo gruppo ----------
do $$
declare
  p uuid;
  owner uuid;
begin
  if exists (select 1 from players where pod_id is null) or exists (select 1 from tiers where pod_id is null)
     or exists (select 1 from games where pod_id is null) or exists (select 1 from debts where pod_id is null)
     or exists (select 1 from loans where pod_id is null) or exists (select 1 from decks where pod_id is null) then
    -- admin di prima (lista email autorizzate), altrimenti il primo utente registrato
    select u.id into owner from auth.users u
      join allowed_emails a on a.email = lower(u.email) and a.is_admin
      order by u.created_at limit 1;
    if owner is null then select id into owner from auth.users order by created_at limit 1; end if;

    insert into pods (name, created_by) values ('Il nostro gruppo', owner) returning id into p;
    update players set pod_id = p where pod_id is null;
    update tiers   set pod_id = p where pod_id is null;
    update decks   set pod_id = p where pod_id is null;
    update debts   set pod_id = p where pod_id is null;
    update loans   set pod_id = p where pod_id is null;
    update games   set pod_id = p where pod_id is null;

    -- entrano nel gruppo gli utenti che erano nella lista delle email autorizzate (admin chi lo era);
    -- il giocatore lo scelgono dall'app al primo accesso
    insert into pod_members (pod_id, user_id, role)
    select p, u.id, case when a.is_admin or u.id = owner then 'admin' else 'user' end
    from auth.users u
    join allowed_emails a on a.email = lower(u.email)
    on conflict do nothing;
    if owner is not null then
      insert into pod_members (pod_id, user_id, role) values (p, owner, 'admin') on conflict do nothing;
    end if;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['players','tiers','decks','debts','loans','games'] loop
    execute format('alter table %I alter column pod_id set not null', t);
  end loop;
end $$;

update pod_members m set email = u.email from auth.users u where u.id = m.user_id and m.email is distinct from u.email;

-- registrazione libera: niente più lista di email autorizzate (chi non è in un gruppo non vede niente)
drop trigger if exists check_allowed_email on auth.users;
drop policy if exists "allowed_read" on allowed_emails;
drop policy if exists "allowed_insert" on allowed_emails;
drop policy if exists "allowed_update" on allowed_emails;
drop policy if exists "allowed_delete" on allowed_emails;

-- ---------- funzioni di controllo (usate dalle regole) ----------
create or replace function public.is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pod_members where pod_id = p and user_id = auth.uid())
$$;

create or replace function public.is_pod_admin(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pod_members where pod_id = p and user_id = auth.uid() and role = 'admin')
$$;

create or replace function public.my_player(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select player_id from pod_members where pod_id = p and user_id = auth.uid()
$$;

-- il giocatore appartiene al gruppo?
create or replace function public.player_in_pod(pl uuid, p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pl is null or exists (select 1 from players where id = pl and pod_id = p)
$$;

-- io (il mio giocatore) partecipo a questa partita?
create or replace function public.in_game(participants jsonb, p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(participants @> jsonb_build_array(jsonb_build_object('player_id', public.my_player(p))), false)
$$;

-- ---------- azioni (funzioni sul server, così le regole non si aggirano) ----------
-- crea un gruppo: chi lo crea ne è admin; tier di partenza S, 1, 2
create or replace function public.create_pod(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare p uuid;
begin
  if auth.uid() is null then raise exception 'serve il login'; end if;
  if (select count(*) from pods where created_by = auth.uid()) >= 5 then
    raise exception 'puoi creare al massimo 5 gruppi';
  end if;
  insert into pods (name, created_by, color)
    values (btrim(p_name), auth.uid(), public.pod_color((select count(*) from pods))) returning id into p;
  insert into pod_members (pod_id, user_id, role, email)
    values (p, auth.uid(), 'admin', (select email from auth.users where id = auth.uid()));
  insert into tiers (pod_id, name, color, sort_order)
    values (p, 'S', '#e05252', 0), (p, '1', '#c9a227', 1), (p, '2', '#4f8cf0', 2);
  return p;
end $$;

-- codice invito (solo admin): 6 caratteri facili da leggere, es. K7PQ2M
create or replace function public.create_invite(p_pod uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_pod_admin(p_pod) then raise exception 'solo gli admin del gruppo possono invitare'; end if;
  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') into c
    from generate_series(1, 6);
    exit when not exists (select 1 from pod_invites where code = c);
  end loop;
  insert into pod_invites (code, pod_id, created_by) values (c, p_pod, auth.uid());
  return c;
end $$;

-- entra in un gruppo con un codice
create or replace function public.join_pod(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv pod_invites;
begin
  if auth.uid() is null then raise exception 'serve il login'; end if;
  select * into inv from pod_invites where code = upper(btrim(p_code)) for update;
  if inv.code is null or inv.expires_at < now() or inv.uses_left <= 0 then
    raise exception 'codice non valido o scaduto';
  end if;
  if not exists (select 1 from pod_members where pod_id = inv.pod_id and user_id = auth.uid()) then
    insert into pod_members (pod_id, user_id, role, email)
      values (inv.pod_id, auth.uid(), 'user', (select email from auth.users where id = auth.uid()));
    update pod_invites set uses_left = uses_left - 1 where code = inv.code;
  end if;
  return inv.pod_id;
end $$;

-- "chi sono" nel gruppo: un giocatore già inserito (non ancora preso da altri) oppure uno nuovo
create or replace function public.claim_player(p_pod uuid, p_player uuid default null, p_name text default null, p_color text default '#c9a227')
returns uuid
language plpgsql security definer set search_path = public as $$
declare pl uuid;
begin
  if not public.is_member(p_pod) then raise exception 'non sei in questo gruppo'; end if;
  if p_player is not null then
    if not exists (select 1 from players where id = p_player and pod_id = p_pod) then raise exception 'giocatore non trovato'; end if;
    if exists (select 1 from pod_members where player_id = p_player and user_id <> auth.uid()) then
      raise exception 'questo giocatore è già di un altro utente';
    end if;
    pl := p_player;
  else
    if coalesce(btrim(p_name), '') = '' then raise exception 'serve un nome'; end if;
    insert into players (pod_id, name, color) values (p_pod, btrim(p_name), p_color) returning id into pl;
  end if;
  update pod_members set player_id = pl where pod_id = p_pod and user_id = auth.uid();
  return pl;
end $$;

-- i miei gruppi con quello che serve al selettore: ruolo, mio giocatore, giocatori attivi, ultima partita
create or replace function public.my_pods()
returns table (pod_id uuid, name text, color text, role text, player_id uuid, players bigint, last_game timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.color, m.role, m.player_id,
         (select count(*) from players pl where pl.pod_id = p.id and not pl.archived),
         (select max(g.played_at) from games g where g.pod_id = p.id)
  from pod_members m join pods p on p.id = m.pod_id
  where m.user_id = auth.uid()
  order by p.name
$$;

-- un gruppo deve sempre avere almeno un admin
create or replace function public.keep_one_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from pods where id = old.pod_id) -- se si elimina il gruppo intero va bene
     and old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin')
     and not exists (select 1 from pod_members where pod_id = old.pod_id and role = 'admin' and user_id <> old.user_id) then
    raise exception 'il gruppo deve avere almeno un admin';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists keep_one_admin on pod_members;
create trigger keep_one_admin before update or delete on pod_members
for each row execute function public.keep_one_admin();

-- ---------- accesso dell'app (i progetti Supabase recenti non lo danno in automatico) ----------
grant usage on schema public to authenticated;
grant select, insert, update, delete on players, tiers, decks, debts, loans, games, pods, pod_members, pod_invites to authenticated;
grant execute on function public.is_member(uuid), public.is_pod_admin(uuid), public.my_player(uuid),
  public.player_in_pod(uuid, uuid), public.in_game(jsonb, uuid),
  public.create_pod(text), public.create_invite(uuid), public.join_pod(text),
  public.claim_player(uuid, uuid, text, text), public.my_pods() to authenticated;
revoke execute on function public.create_pod(text), public.create_invite(uuid), public.join_pod(text),
  public.claim_player(uuid, uuid, text, text) from anon;

-- ---------- regole (Row Level Security) ----------
alter table pods enable row level security;
alter table pod_members enable row level security;
alter table pod_invites enable row level security;

do $$
declare t text; pol record;
begin
  -- via le regole vecchie (amici_all, liste email) e quelle di un'esecuzione precedente di questo file
  for pol in select policyname, tablename from pg_policies
             where schemaname = 'public' and tablename in ('players','tiers','decks','debts','loans','games','pods','pod_members','pod_invites')
  loop
    execute format('drop policy %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- gruppi: li vede chi ne fa parte; l'admin li rinomina o elimina; si creano con create_pod()
create policy pods_read on pods for select to authenticated using (public.is_member(id));
create policy pods_update on pods for update to authenticated using (public.is_pod_admin(id)) with check (public.is_pod_admin(id));
create policy pods_delete on pods for delete to authenticated using (public.is_pod_admin(id));

-- membri: visibili al gruppo; l'admin cambia ruoli e giocatori o toglie membri; ognuno può uscire
create policy members_read on pod_members for select to authenticated using (public.is_member(pod_id));
create policy members_update on pod_members for update to authenticated using (public.is_pod_admin(pod_id)) with check (public.is_pod_admin(pod_id));
create policy members_delete on pod_members for delete to authenticated using (public.is_pod_admin(pod_id) or user_id = auth.uid());

-- inviti: solo admin (si creano con create_invite(), si usano con join_pod())
create policy invites_read on pod_invites for select to authenticated using (public.is_pod_admin(pod_id));
create policy invites_delete on pod_invites for delete to authenticated using (public.is_pod_admin(pod_id));

-- lettura: tutto il gruppo vede tutto
do $$
declare t text;
begin
  foreach t in array array['players','tiers','decks','debts','loans','games'] loop
    execute format('create policy %I on %I for select to authenticated using (public.is_member(pod_id))', t || '_read', t);
  end loop;
end $$;

-- giocatori: admin tutto; user solo il proprio (nome e colore); nuovi giocatori per sé con claim_player()
create policy players_insert on players for insert to authenticated with check (public.is_pod_admin(pod_id));
create policy players_update on players for update to authenticated
  using (public.is_pod_admin(pod_id) or id = public.my_player(pod_id))
  with check (public.is_pod_admin(pod_id) or id = public.my_player(pod_id));
create policy players_delete on players for delete to authenticated using (public.is_pod_admin(pod_id));

-- tier: solo admin
create policy tiers_insert on tiers for insert to authenticated with check (public.is_pod_admin(pod_id));
create policy tiers_update on tiers for update to authenticated using (public.is_pod_admin(pod_id)) with check (public.is_pod_admin(pod_id));
create policy tiers_delete on tiers for delete to authenticated using (public.is_pod_admin(pod_id));

-- mazzi: admin tutti; user solo i suoi
create policy decks_write on decks for all to authenticated
  using (public.is_pod_admin(pod_id) or player_id = public.my_player(pod_id))
  with check (
    public.player_in_pod(player_id, pod_id)
    and (public.is_pod_admin(pod_id) or player_id = public.my_player(pod_id))
    and (tier_id is null or exists (select 1 from tiers t where t.id = tier_id and t.pod_id = decks.pod_id))
  );

-- partite: ogni membro registra; modifica/elimina admin o chi ha giocato
create policy games_insert on games for insert to authenticated
  with check (public.is_member(pod_id) and public.player_in_pod(winner_player_id, pod_id));
create policy games_update on games for update to authenticated
  using (public.is_pod_admin(pod_id) or public.in_game(participants, pod_id))
  with check (public.is_member(pod_id) and public.player_in_pod(winner_player_id, pod_id));
create policy games_delete on games for delete to authenticated
  using (public.is_pod_admin(pod_id) or public.in_game(participants, pod_id));

-- soldi: admin tutto; user solo i movimenti in cui è debitore o creditore
create policy debts_write on debts for all to authenticated
  using (public.is_pod_admin(pod_id) or public.my_player(pod_id) in (debtor_id, creditor_id))
  with check (
    public.player_in_pod(debtor_id, pod_id) and public.player_in_pod(creditor_id, pod_id)
    and (public.is_pod_admin(pod_id) or public.my_player(pod_id) in (debtor_id, creditor_id))
  );

-- carte: admin tutto; user solo gli scambi in cui dà o riceve
create policy loans_write on loans for all to authenticated
  using (public.is_pod_admin(pod_id) or public.my_player(pod_id) in (lender_id, borrower_id))
  with check (
    public.player_in_pod(lender_id, pod_id) and public.player_in_pod(borrower_id, pod_id)
    and (public.is_pod_admin(pod_id) or public.my_player(pod_id) in (lender_id, borrower_id))
  );

-- tempo reale anche per gruppi e membri
do $$
declare t text;
begin
  foreach t in array array['pods','pod_members'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
