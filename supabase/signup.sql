-- ============================================================
-- MTG tra amici - REGISTRAZIONE SOLO CON CODICE INVITO
-- Da lanciare DOPO schema.sql e pods.sql. Si può rieseguire.
--
-- - un account nuovo si crea solo con un codice invito valido (non scaduto, con usi rimasti),
--   che l'app manda alla registrazione (signUp con options.data.invite)
-- - con quel codice si entra subito nel gruppo dell'invito (poi l'app chiede "chi sei")
-- - il controllo è nel database: vale anche per chi chiama Supabase senza passare dall'app
-- - chi è già registrato non cambia niente: entra come prima e usa i codici dall'app (join_pod)
--
-- Per creare a mano un utente dalla dashboard di Supabase (senza codice):
--   alter table auth.users disable trigger signup_invite;  … crea l'utente …  enable trigger signup_invite;
-- ============================================================

-- l'app controlla il codice prima di registrarsi, per dire subito se è sbagliato:
-- restituisce il nome del gruppo, oppure null se il codice non vale
create or replace function public.invite_pod_name(p_code text) returns text
language sql stable security definer set search_path = public as $$
  select p.name from pod_invites i join pods p on p.id = i.pod_id
  where i.code = upper(btrim(p_code)) and i.expires_at >= now() and i.uses_left > 0
$$;
revoke all on function public.invite_pod_name(text) from public;
grant execute on function public.invite_pod_name(text) to anon, authenticated;

-- alla creazione dell'account: codice valido, un uso in meno, ingresso nel gruppo.
-- Se il codice non vale l'errore annulla anche la creazione dell'account.
create or replace function public.signup_with_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'invite', '')));
  p uuid;
begin
  if c = '' then raise exception 'registrazione solo con codice invito'; end if;
  update pod_invites set uses_left = uses_left - 1
    where code = c and expires_at >= now() and uses_left > 0
    returning pod_id into p;
  if p is null then raise exception 'codice invito non valido o scaduto'; end if;
  insert into pod_members (pod_id, user_id, role, email) values (p, new.id, 'user', new.email)
    on conflict do nothing;
  return null;
end $$;
revoke all on function public.signup_with_invite() from public, anon, authenticated;

drop trigger if exists signup_invite on auth.users;
create trigger signup_invite after insert on auth.users
for each row execute function public.signup_with_invite();

notify pgrst, 'reload schema';
