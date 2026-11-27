-- Verifiche su migrazione dei mazzi, permessi e scritture atomiche. Ogni controllo fallito ferma tutto.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set P1 '10000000-0000-0000-0000-000000000001'
\set P2 '10000000-0000-0000-0000-000000000002'

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FALLITO: %', what; end if;
  raise notice 'ok: %', what;
end $$;
-- esegue sql come utente u e si aspetta un errore
create or replace function pg_temp.fails(u uuid, q text, what text) returns void language plpgsql as $$
declare failed boolean := false;
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  begin
    set local role authenticated;
    execute q;
  exception when others then failed := true;
  end;
  reset role;
  perform pg_temp.check(failed, what);
end $$;
create or replace function pg_temp.runs(u uuid, q text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  set local role authenticated;
  execute q;
  reset role;
end $$;

-- ---------- migrazione dei mazzi (decks.sql) ----------
select pg_temp.check((select count(*) = 1 from decks where lower(btrim(commander)) = 'atraxa'), 'Atraxa doppia in P1 e P2 diventa un mazzo solo');
select pg_temp.check((select owner_user = :'A' from decks where commander = 'Atraxa'), 'Atraxa è personale di A');
select pg_temp.check((select image_url = 'img.png' from decks where commander = 'Atraxa'), 'immagine presa dalla copia che l''aveva');
select pg_temp.check((select participants->0->>'deck_id' = '40000000-0000-0000-0000-000000000001' from games), 'partita ricollegata al mazzo tenuto');
select pg_temp.check((select count(*) = 2 from deck_pod where deck_id = '40000000-0000-0000-0000-000000000001'), 'Atraxa compare in entrambi i gruppi');
select pg_temp.check((select tier_id = '20000000-0000-0000-0000-000000000002' from deck_pod where deck_id = '40000000-0000-0000-0000-000000000001' and pod_id = :'P2'), 'tier di P2 conservato');
select pg_temp.check((select owner_user is null and pod_id = :'P1' from decks where commander = 'Guest deck'), 'mazzo del giocatore senza account resta del gruppo');
select pg_temp.check((select not active from decks where commander = 'Krenko'), 'Krenko ritirato resta ritirato');

-- ---------- permessi dei mazzi (vista pod_decks) ----------
select pg_temp.fails(:'B', $q$update pod_decks set notes = 'x' where id = '40000000-0000-0000-0000-000000000001' and pod_id = '10000000-0000-0000-0000-000000000001'$q$, 'B non modifica il mazzo personale di A');
select pg_temp.fails(:'B', $q$update pod_decks set tier_id = null where id = '40000000-0000-0000-0000-000000000001' and pod_id = '10000000-0000-0000-0000-000000000001'$q$, 'B non cambia il tier di un mazzo di A');
select pg_temp.fails(:'B', $q$insert into pod_decks (pod_id, player_id, commander) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000a1', 'X')$q$, 'B non crea mazzi per A');
select pg_temp.fails(:'A', $q$update pod_decks set tier_id = '20000000-0000-0000-0000-000000000002' where id = '40000000-0000-0000-0000-000000000001' and pod_id = '10000000-0000-0000-0000-000000000001'$q$, 'il tier di un gruppo non vale in un altro');
select pg_temp.runs(:'A', $q$update pod_decks set notes = 'note' where id = '40000000-0000-0000-0000-000000000001' and pod_id = '10000000-0000-0000-0000-000000000002'$q$);
select pg_temp.check((select notes = 'note' from decks where id = '40000000-0000-0000-0000-000000000001'), 'A modifica il suo mazzo da un altro gruppo');
select pg_temp.runs(:'C', $q$update pod_decks set tier_id = null where id = '40000000-0000-0000-0000-000000000001' and pod_id = '10000000-0000-0000-0000-000000000002'$q$);
select pg_temp.check((select tier_id is null from deck_pod where deck_id = '40000000-0000-0000-0000-000000000001' and pod_id = :'P2'), 'l''admin di P2 cambia il tier in P2');
select pg_temp.check((select tier_id is not null from deck_pod where deck_id = '40000000-0000-0000-0000-000000000001' and pod_id = :'P1'), '…e in P1 il tier non cambia');
select pg_temp.runs(:'B', $q$insert into pod_decks (id, pod_id, player_id, commander) values ('40000000-0000-0000-0000-0000000000b9', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000b1', 'Meren')$q$);
select pg_temp.check((select owner_user = :'B' from decks where id = '40000000-0000-0000-0000-0000000000b9'), 'nuovo mazzo di B diventa personale');

-- ---------- scritture atomiche (ops.sql) ----------
-- B in P1: spesa divisa con A, inserita e poi modificata in un'unica operazione
select pg_temp.runs(:'B', $q$select apply_ops('[
  {"op":"insert","table":"debts","row":{"id":"60000000-0000-0000-0000-000000000001","pod_id":"10000000-0000-0000-0000-000000000001","debtor_id":"30000000-0000-0000-0000-0000000000a1","creditor_id":"30000000-0000-0000-0000-0000000000b1","amount":5,"description":"Pizza","settled":false,"group_id":null,"group_total":null}}
]'::jsonb)$q$);
select pg_temp.check((select amount = 5 and created_at is not null from debts where id = '60000000-0000-0000-0000-000000000001'), 'insert con valori predefiniti (created_at)');
select pg_temp.runs(:'B', $q$select apply_ops('[
  {"op":"delete","table":"debts","id":"60000000-0000-0000-0000-000000000001"},
  {"op":"insert","table":"debts","row":{"id":"60000000-0000-0000-0000-000000000002","pod_id":"10000000-0000-0000-0000-000000000001","debtor_id":"30000000-0000-0000-0000-0000000000a1","creditor_id":"30000000-0000-0000-0000-0000000000b1","amount":7.5,"description":"Pizza","settled":false}},
  {"op":"update","table":"debts","id":"60000000-0000-0000-0000-000000000002","patch":{"description":"Pizza e birra"}}
]'::jsonb)$q$);
select pg_temp.check((select count(*) = 1 from debts where description = 'Pizza e birra' and amount = 7.5), 'sostituzione delle righe (elimina + inserisce + aggiorna)');
-- un'operazione non permessa annulla anche quelle prima: C non è in P1
select pg_temp.fails(:'C', $q$select apply_ops('[
  {"op":"update","table":"debts","id":"60000000-0000-0000-0000-000000000002","patch":{"settled":true}}
]'::jsonb)$q$, 'C (fuori da P1) non tocca le spese di P1');
select pg_temp.fails(:'B', $q$select apply_ops('[
  {"op":"update","table":"debts","id":"60000000-0000-0000-0000-000000000002","patch":{"settled":true}},
  {"op":"delete","table":"debts","id":"60000000-0000-0000-0000-0000000000ff"}
]'::jsonb)$q$, 'una riga che non c''è fa fallire tutto');
select pg_temp.check((select not settled from debts where id = '60000000-0000-0000-0000-000000000002'), '…e la prima modifica viene annullata');
select pg_temp.fails(:'A', $q$select apply_ops('[{"op":"delete","table":"pod_members","id":"00000000-0000-0000-0000-000000000000"}]'::jsonb)$q$, 'solo le tabelle permesse');
select pg_temp.fails(:'B', $q$select apply_ops('[{"op":"update","table":"debts","id":"60000000-0000-0000-0000-000000000002","patch":{"debtor_id":"30000000-0000-0000-0000-0000000000a2"}}]'::jsonb)$q$, 'le regole valgono anche dentro apply_ops (giocatore di un altro gruppo)');
-- array e jsonb: una partita intera
select pg_temp.runs(:'A', $q$select apply_ops('[
  {"op":"insert","table":"games","row":{"id":"50000000-0000-0000-0000-000000000002","pod_id":"10000000-0000-0000-0000-000000000001","played_at":"2026-11-26T20:00:00Z","starting_life":40,"winner_player_id":"30000000-0000-0000-0000-0000000000a1","participants":[{"player_id":"30000000-0000-0000-0000-0000000000a1","deck_id":null,"final_life":12,"eliminated_order":null}],"duration_min":75,"notes":null}}
]'::jsonb)$q$);
select pg_temp.check((select jsonb_array_length(participants) = 1 from games where id = '50000000-0000-0000-0000-000000000002'), 'jsonb e date passano intatti');

-- ---------- registrazione solo con codice invito (signup.sql) ----------
insert into pod_invites (code, pod_id, uses_left) values ('ABC234', :'P1', 1), ('OLD999', :'P1', 5);
update pod_invites set expires_at = now() - interval '1 day' where code = 'OLD999';
do $$
declare failed boolean;
begin
  failed := false;
  begin insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d0', 'senza@x');
  exception when others then failed := true; end;
  perform pg_temp.check(failed, 'senza codice invito non ci si registra');
  failed := false;
  begin insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000d0', 'sbagliato@x', '{"invite":"NOPE00"}');
  exception when others then failed := true; end;
  perform pg_temp.check(failed, 'con un codice inventato non ci si registra');
  failed := false;
  begin insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000d0', 'scaduto@x', '{"invite":"OLD999"}');
  exception when others then failed := true; end;
  perform pg_temp.check(failed, 'con un codice scaduto non ci si registra');
end $$;
select pg_temp.check(public.invite_pod_name(' abc234 ') = 'P1', 'il codice si controlla prima (minuscole e spazi vanno bene)');
select pg_temp.check(public.invite_pod_name('OLD999') is null, '…e un codice scaduto non vale');
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000d1', 'nuovo@x', '{"invite":"abc234"}');
select pg_temp.check((select role = 'user' and player_id is null from pod_members where user_id = '00000000-0000-0000-0000-0000000000d1' and pod_id = :'P1'), 'con il codice si entra subito nel gruppo (poi "chi sei")');
select pg_temp.check((select uses_left = 0 from pod_invites where code = 'ABC234'), 'il codice perde un uso');
do $$
declare failed boolean := false;
begin
  begin insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000d2', 'tardi@x', '{"invite":"ABC234"}');
  exception when others then failed := true; end;
  perform pg_temp.check(failed and not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000d2'), 'codice esaurito: nessun account creato');
end $$;
select pg_temp.check(has_function_privilege('anon', 'public.invite_pod_name(text)', 'execute') and not has_function_privilege('anon', 'public.signup_with_invite()', 'execute'), 'da fuori si può solo controllare il codice');

select 'TUTTI I CONTROLLI SUPERATI' as esito;
