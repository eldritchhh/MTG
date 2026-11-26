-- ============================================================
-- MTG tra amici - MAZZI PERSONALI (legati all'account, visibili in tutti i suoi gruppi)
-- Da lanciare DOPO schema.sql, pods.sql e cards.sql. Si può rieseguire.
-- Le regole dei mazzi stanno solo qui: rilanciare pods.sql non le tocca.
--
-- decks      mazzo personale: owner_user = account, pod_id e player_id vuoti
--            mazzo di gruppo (giocatore senza account): pod_id + player_id, come prima
-- deck_pod   in quali gruppi compare un mazzo personale: sotto quale giocatore,
--            con quale tier (ogni gruppo ha i suoi) e se è nascosto in quel gruppo
-- pod_decks  vista usata dall'app: i mazzi di un gruppo con giocatore e tier già risolti.
--            L'app legge e scrive qui; le scritture passano dai trigger qui sotto.
--
-- Migrazione (una volta, poi a ogni nuovo collegamento account-giocatore): i mazzi dei giocatori
-- collegati a un account diventano personali; lo stesso comandante (e partner) in più gruppi
-- diventa un solo mazzo e le partite vengono ricollegate. Il tier resta per gruppo.
-- ============================================================

alter table decks add column if not exists owner_user uuid references auth.users(id) on delete cascade;
alter table decks alter column pod_id drop not null;
alter table decks alter column player_id drop not null;
create index if not exists decks_owner on decks(owner_user);

create table if not exists deck_pod (
  deck_id uuid not null references decks(id) on delete cascade,
  pod_id uuid not null references pods(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  tier_id uuid references tiers(id) on delete set null,
  hidden boolean not null default false, -- "non lo porto in questo gruppo"
  created_at timestamptz not null default now(),
  primary key (deck_id, pod_id)
);
create index if not exists deck_pod_pod on deck_pod(pod_id);

-- ---------- da mazzi di gruppo a mazzi personali ----------
create or replace function public.personalize_decks(u uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d record;
  keep uuid;
  keep_active boolean;
  hide boolean;
begin
  for d in
    select dk.* from decks dk
    join pod_members m on m.pod_id = dk.pod_id and m.player_id = dk.player_id
    where dk.owner_user is null and m.user_id = u
    order by dk.created_at, dk.id
  loop
    -- stesso comandante (e partner) già tra i mazzi personali: è lo stesso mazzo
    select id, active into keep, keep_active from decks
      where owner_user = u
        and lower(btrim(commander)) = lower(btrim(d.commander))
        and lower(btrim(coalesce(partner, ''))) = lower(btrim(coalesce(d.partner, '')))
      order by created_at limit 1;
    if keep is null then
      update decks set owner_user = u, pod_id = null, player_id = null, tier_id = null where id = d.id;
      keep := d.id;
      hide := false;
    else
      -- "attivo" è del mazzo: se una copia è attiva il mazzo è attivo, e resta nascosto dove non lo era
      hide := not d.active and keep_active;
      if d.active and not keep_active then
        update deck_pod set hidden = true where deck_id = keep;
      end if;
      update decks k set
        image_url = coalesce(k.image_url, d.image_url),
        partner_image_url = coalesce(k.partner_image_url, d.partner_image_url),
        notes = coalesce(nullif(k.notes, ''), d.notes),
        tags = array(select distinct x from unnest(k.tags || d.tags) x),
        colors = case when cardinality(k.colors) = 0 then d.colors else k.colors end,
        active = k.active or d.active
      where k.id = keep;
      -- partite: il mazzo doppio diventa quello tenuto
      update games g set participants = (
          select jsonb_agg(case when x->>'deck_id' = d.id::text then jsonb_set(x, '{deck_id}', to_jsonb(keep::text)) else x end order by o)
          from jsonb_array_elements(g.participants) with ordinality t(x, o))
        where g.participants @> jsonb_build_array(jsonb_build_object('deck_id', d.id::text));
      delete from decks where id = d.id;
    end if;
    -- nel suo gruppo resta con lo stesso tier
    insert into deck_pod (deck_id, pod_id, player_id, tier_id, hidden)
      values (keep, d.pod_id, d.player_id, d.tier_id, hide)
      on conflict (deck_id, pod_id) do nothing;
  end loop;

  -- i mazzi personali compaiono in tutti i gruppi in cui l'account ha un giocatore
  insert into deck_pod (deck_id, pod_id, player_id)
    select dk.id, m.pod_id, m.player_id
    from decks dk join pod_members m on m.user_id = dk.owner_user and m.player_id is not null
    where dk.owner_user = u
    on conflict (deck_id, pod_id) do nothing;
end $$;

-- quando un account entra in un gruppo o sceglie/cambia il suo giocatore
create or replace function public.member_decks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.player_id is not null then
    update deck_pod dp set player_id = new.player_id
      from decks d
      where d.id = dp.deck_id and d.owner_user = new.user_id and dp.pod_id = new.pod_id and dp.player_id <> new.player_id;
    perform public.personalize_decks(new.user_id);
  end if;
  return new;
end $$;
drop trigger if exists member_decks on pod_members;
create trigger member_decks after insert or update of player_id on pod_members
for each row execute function public.member_decks();

-- migrazione dei mazzi esistenti
select public.personalize_decks(x.user_id)
from (select distinct user_id from pod_members where player_id is not null) x;

alter table decks drop constraint if exists decks_kind;
alter table decks add constraint decks_kind check (
  (owner_user is null and pod_id is not null and player_id is not null)
  or (owner_user is not null and pod_id is null and player_id is null)
);

-- ---------- vista per l'app ----------
drop view if exists pod_decks;
create view pod_decks as
  select d.id, d.pod_id, d.player_id, d.owner_user, d.commander, d.partner, d.colors, d.tags,
         d.image_url, d.partner_image_url, d.notes, d.tier_id, d.active, false as hidden, d.created_at
  from decks d
  where d.owner_user is null and public.is_member(d.pod_id)
  union all
  select d.id, dp.pod_id, dp.player_id, d.owner_user, d.commander, d.partner, d.colors, d.tags,
         d.image_url, d.partner_image_url, d.notes, dp.tier_id, d.active, dp.hidden, d.created_at
  from decks d join deck_pod dp on dp.deck_id = d.id
  where public.is_member(dp.pod_id);

create or replace function public.check_tier(t uuid, p uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if t is not null and not exists (select 1 from tiers where id = t and pod_id = p) then
    raise exception 'tier non valido per questo gruppo';
  end if;
end $$;

-- nuovo mazzo: personale se il giocatore ha un account, altrimenti del gruppo
create or replace function public.pod_decks_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u uuid;
  i uuid := coalesce(new.id, gen_random_uuid());
begin
  if not public.is_member(new.pod_id) then raise exception 'non sei in questo gruppo'; end if;
  if new.player_id is null or not public.player_in_pod(new.player_id, new.pod_id) then raise exception 'giocatore non valido'; end if;
  if not (public.is_pod_admin(new.pod_id) or new.player_id = public.my_player(new.pod_id)) then
    raise exception 'puoi aggiungere solo i tuoi mazzi';
  end if;
  perform public.check_tier(new.tier_id, new.pod_id);
  select user_id into u from pod_members where pod_id = new.pod_id and player_id = new.player_id;
  if u is null then
    insert into decks (id, pod_id, player_id, commander, partner, colors, tags, image_url, partner_image_url, notes, tier_id, active, created_at)
    values (i, new.pod_id, new.player_id, new.commander, new.partner, coalesce(new.colors, '{}'), coalesce(new.tags, '{}'),
            new.image_url, new.partner_image_url, new.notes, new.tier_id, coalesce(new.active, true), coalesce(new.created_at, now()));
  else
    insert into decks (id, owner_user, commander, partner, colors, tags, image_url, partner_image_url, notes, active, created_at)
    values (i, u, new.commander, new.partner, coalesce(new.colors, '{}'), coalesce(new.tags, '{}'),
            new.image_url, new.partner_image_url, new.notes, coalesce(new.active, true), coalesce(new.created_at, now()));
    insert into deck_pod (deck_id, pod_id, player_id, tier_id, hidden)
      values (i, new.pod_id, new.player_id, new.tier_id, coalesce(new.hidden, false));
    insert into deck_pod (deck_id, pod_id, player_id)
      select i, m.pod_id, m.player_id from pod_members m where m.user_id = u and m.player_id is not null
      on conflict (deck_id, pod_id) do nothing;
  end if;
  new.id := i;
  return new;
end $$;

-- modifica: il mazzo personale lo cambia solo chi lo possiede; tier e "nascosto" valgono per il gruppo
-- (li cambiano il proprietario o l'admin del gruppo)
create or replace function public.pod_decks_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.owner_user is null then
    if not (public.is_pod_admin(old.pod_id) or old.player_id = public.my_player(old.pod_id)) then
      raise exception 'non puoi modificare questo mazzo';
    end if;
    if new.player_id is distinct from old.player_id
       and not (public.player_in_pod(new.player_id, old.pod_id) and new.player_id is not null
                and (public.is_pod_admin(old.pod_id) or new.player_id = public.my_player(old.pod_id))) then
      raise exception 'giocatore non valido';
    end if;
    perform public.check_tier(new.tier_id, old.pod_id);
    update decks set player_id = new.player_id, commander = new.commander, partner = new.partner, colors = new.colors,
      tags = new.tags, image_url = new.image_url, partner_image_url = new.partner_image_url, notes = new.notes,
      tier_id = new.tier_id, active = new.active
    where id = old.id;
  else
    if new.player_id is distinct from old.player_id then
      raise exception 'un mazzo personale resta di chi lo possiede';
    end if;
    if (new.commander, new.partner, new.colors, new.tags, new.image_url, new.partner_image_url, new.notes, new.active)
       is distinct from (old.commander, old.partner, old.colors, old.tags, old.image_url, old.partner_image_url, old.notes, old.active) then
      if old.owner_user is distinct from auth.uid() then raise exception 'solo chi possiede il mazzo può modificarlo'; end if;
      update decks set commander = new.commander, partner = new.partner, colors = new.colors, tags = new.tags,
        image_url = new.image_url, partner_image_url = new.partner_image_url, notes = new.notes, active = new.active
      where id = old.id;
    end if;
    if (new.tier_id, new.hidden) is distinct from (old.tier_id, old.hidden) then
      if not (old.owner_user = auth.uid() or public.is_pod_admin(old.pod_id)) then
        raise exception 'il tier lo cambiano chi possiede il mazzo o l''admin';
      end if;
      perform public.check_tier(new.tier_id, old.pod_id);
      update deck_pod set tier_id = new.tier_id, hidden = coalesce(new.hidden, false)
      where deck_id = old.id and pod_id = old.pod_id;
    end if;
  end if;
  return new;
end $$;

-- eliminazione: il mazzo personale lo elimina (da tutti i gruppi) solo chi lo possiede;
-- l'admin di un gruppo lo nasconde soltanto in quel gruppo
create or replace function public.pod_decks_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.owner_user is null then
    if not (public.is_pod_admin(old.pod_id) or old.player_id = public.my_player(old.pod_id)) then
      raise exception 'non puoi eliminare questo mazzo';
    end if;
    delete from decks where id = old.id;
  elsif old.owner_user = auth.uid() then
    delete from decks where id = old.id;
  elsif public.is_pod_admin(old.pod_id) then
    update deck_pod set hidden = true where deck_id = old.id and pod_id = old.pod_id;
  else
    raise exception 'non puoi eliminare questo mazzo';
  end if;
  return old;
end $$;

drop trigger if exists pod_decks_insert on pod_decks;
drop trigger if exists pod_decks_update on pod_decks;
drop trigger if exists pod_decks_delete on pod_decks;
create trigger pod_decks_insert instead of insert on pod_decks for each row execute function public.pod_decks_insert();
create trigger pod_decks_update instead of update on pod_decks for each row execute function public.pod_decks_update();
create trigger pod_decks_delete instead of delete on pod_decks for each row execute function public.pod_decks_delete();

-- ---------- accesso e regole ----------
grant select, insert, update, delete on pod_decks to authenticated;
grant select on deck_pod to authenticated;
revoke all on function public.personalize_decks(uuid) from public, anon, authenticated;
alter table deck_pod enable row level security;

drop policy if exists decks_read on decks;
drop policy if exists decks_write on decks;
drop policy if exists deck_pod_read on deck_pod;

-- lettura diretta (serve al tempo reale): mazzi del gruppo, i miei, quelli che compaiono nei miei gruppi
create policy decks_read on decks for select to authenticated using (
  (pod_id is not null and public.is_member(pod_id))
  or owner_user = auth.uid()
  or exists (select 1 from deck_pod dp where dp.deck_id = decks.id and public.is_member(dp.pod_id))
);
-- scrittura diretta: come prima per i mazzi di gruppo, solo il proprietario per quelli personali
-- (l'app scrive dalla vista pod_decks)
create policy decks_write on decks for all to authenticated
  using (
    (owner_user is null and (public.is_pod_admin(pod_id) or player_id = public.my_player(pod_id)))
    or owner_user = auth.uid()
  )
  with check (
    (owner_user is null and public.player_in_pod(player_id, pod_id)
      and (public.is_pod_admin(pod_id) or player_id = public.my_player(pod_id))
      and (tier_id is null or exists (select 1 from tiers t where t.id = tier_id and t.pod_id = decks.pod_id)))
    or (owner_user = auth.uid() and pod_id is null and player_id is null)
  );
create policy deck_pod_read on deck_pod for select to authenticated using (public.is_member(pod_id));

do $$
begin
  alter publication supabase_realtime add table deck_pod;
exception when duplicate_object then null;
end $$;

-- aggiorna subito le API di Supabase (altrimenti l'app può non vedere ancora la vista pod_decks)
notify pgrst, 'reload schema';
