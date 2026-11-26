-- ============================================================
-- MTG tra amici - SCRITTURE ATOMICHE: più operazioni insieme, tutte o nessuna
-- Da lanciare DOPO schema.sql, pods.sql, cards.sql e decks.sql. Si può rieseguire.
--
-- apply_ops(ops) esegue in ordine una lista di operazioni in un'unica transazione:
--   {"op":"insert","table":"debts","row":{...}}
--   {"op":"update","table":"card_loans","id":"…","patch":{...}}
--   {"op":"delete","table":"settlements","id":"…"}
-- Gira con i permessi di chi la chiama (security invoker): valgono le stesse regole (RLS)
-- delle scritture singole. Se un'operazione fallisce, o non tocca nessuna riga (non permessa
-- o già sparita), si annulla tutto.
-- L'app la usa per: modifica ed eliminazione di una spesa, "Pagato", saldo carte e suo annullamento,
-- restituzioni. Senza questo file l'app fa le stesse scritture una alla volta (come prima).
-- ============================================================

create or replace function public.apply_ops(ops jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  o jsonb;
  t text;
  body jsonb;
  cols text;
  n int;
  allowed constant text[] := array['players', 'tiers', 'games', 'debts', 'loans', 'card_loans', 'settlements', 'settlement_items'];
begin
  if jsonb_typeof(ops) <> 'array' then raise exception 'ops deve essere una lista'; end if;
  for o in select value from jsonb_array_elements(ops) loop
    t := o->>'table';
    if t is null or not (t = any(allowed)) then raise exception 'tabella non permessa: %', t; end if;
    body := case o->>'op' when 'insert' then o->'row' when 'update' then o->'patch' else null end;
    if body is not null then
      if jsonb_typeof(body) <> 'object' or body = '{}'::jsonb then raise exception 'dati mancanti per %', t; end if;
      -- solo le colonne indicate (le altre prendono il valore predefinito), mai "id" in un aggiornamento
      select string_agg(quote_ident(k), ', ') into cols
      from jsonb_object_keys(body) k
      where o->>'op' = 'insert' or k <> 'id';
    end if;
    case o->>'op'
      when 'insert' then
        execute format('insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1)', t, cols, cols, t) using body;
      when 'update' then
        if cols is null then continue; end if;
        execute format('update %I set (%s) = (select %s from jsonb_populate_record(null::%I, $1)) where id = $2', t, cols, cols, t)
          using body, (o->>'id')::uuid;
      when 'delete' then
        execute format('delete from %I where id = $1', t) using (o->>'id')::uuid;
      else
        raise exception 'operazione sconosciuta: %', o->>'op';
    end case;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'operazione non permessa o riga non trovata (%, %)', o->>'op', t; end if;
  end loop;
end $$;

revoke all on function public.apply_ops(jsonb) from public, anon;
grant execute on function public.apply_ops(jsonb) to authenticated;

notify pgrst, 'reload schema';
