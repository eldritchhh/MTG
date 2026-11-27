#!/usr/bin/env bash
# Prova gli script SQL su un Postgres usa e getta (mai sul database vero).
# Uso: PGHOST=localhost PGUSER=postgres PGPASSWORD=… scripts/test-sql.sh   (variabili standard di psql)
# Crea un database "mtg_test", installa tutto come su Supabase, migra dati di prova, verifica, poi rilancia tutto
# (gli script devono potersi rieseguire senza danni) e verifica di nuovo.
set -euo pipefail
cd "$(dirname "$0")/.."
PGOPTIONS='-c client_min_messages=warning' psql -d postgres -q -c "drop database if exists mtg_test" -c "create database mtg_test"
DB="mtg_test"
run() { PGOPTIONS='-c client_min_messages=warning' psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$1" > /dev/null; }
run supabase/test/boot.sql
run supabase/schema.sql
run supabase/pods.sql
run supabase/cards.sql
run supabase/test/seed.sql
run supabase/decks.sql
run supabase/ops.sql
run supabase/signup.sql # dopo i dati di prova: da qui gli account si creano solo con un codice invito
# le verifiche: una riga "ok: …" per controllo; al primo fallito si ferma con errore
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f supabase/test/tests.sql 2>&1 | sed -n 's/.*NOTICE:  //p; /FALLITO\|ERROR/p; /SUPERATI/p'
test "${PIPESTATUS[0]}" -eq 0 || { echo "Verifiche SQL fallite"; exit 1; }
# seconda esecuzione di tutti gli script: niente errori, niente doppioni
for f in schema pods cards decks ops signup; do run supabase/$f.sql; done
psql -d "$DB" -At -v ON_ERROR_STOP=1 -c "select case when (select count(*) from pods) = 2 and (select count(*) from decks where lower(btrim(commander)) = 'atraxa') = 1 then 'rieseguibili: ok' else 'rieseguendo gli script qualcosa è cambiato' end" | tee /dev/stderr | grep -q ok
echo "SQL: tutto ok"
