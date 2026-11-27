# MTG tra amici

Web app (installabile sul telefono) per il gruppo di Magic:

- **Partita** – contatore vita per 2–6 giocatori con mazzo scelto, danni da comandante, veleno, timer, vista "tavolo" con metà schermo capovolta. Tieni premuto un giocatore e trascinalo per cambiargli posto. A fine partita scegli il vincitore e viene salvata nelle statistiche.
- **Scambi**
  - *Soldi*: stile Tricount. Debiti tra due persone ("Luca deve 4 € a Francesco per Sol Ring") o **spese divise tra più persone** ("Francesco ha pagato 14 € di spedizione dell'ordine CT0" diviso tra 4, quote uguali o personalizzate). Saldi netti e pareggi minimi ("Marco → Francesco 2,50 €").
  - *Carte*: chi ha dato quali carte a chi, con stato **In prestito / Definitivo / Restituito**. Le carte si aggiungono cercandole per nome (italiano o inglese, da Scryfall) oppure incollando una lista; ogni carta ha il link alla sua pagina Scryfall.
- **Profili** – giocatori e i loro comandanti. La ricerca propone **solo comandanti** (anche partner/background) e imposta di default l'illustrazione della carta e l'identità di colore. Tag, ricerca per tag e **tier**. Con partner/background l'immagine è metà e metà. I comandanti di un giocatore si ordinano per nome, colore o tier e si filtrano per tier e colori (contiene / esatti), con i conteggi.
- **Tier dinamici** (es. S, 1, 2) – si aggiungono, rinominano e riordinano da *Altro → Tier*. Ogni partita salva il tier che il mazzo aveva quel giorno: il filtro per tier delle statistiche usa quello, così i numeri non cambiano quando spostate un mazzo di tier.
- **Statistiche** – vittorie e % (vinte su giocate) per mazzo, giocatore, tag e colore; storico partite; filtri per periodo (30/90 giorni) e per **tier**.
- **Liste di comandanti e carte** – incluse nell'app (generate dal file "All Cards" di Scryfall con `scripts/build-commanders.py` e `scripts/build-card-names.py`, con i nomi italiani): la ricerca è offline, anche per nome italiano. Dopo un nuovo set, da *Altro* l'app chiede a Scryfall solo le novità.
- **Aggiornamenti** – l'app controlla l'ultima Release su GitHub e mostra un banner con il link al nuovo APK.
- **Altro** – accesso (l'admin sceglie quali email possono registrarsi), "Chi sei?" (per vedere il tuo saldo), backup/import JSON, logout.

Costo: **0 €** (GitHub Pages + Supabase piano gratuito).

**Per partire: segui [GUIDA.md](GUIDA.md)** (push, database, APK sul telefono passo passo).

## 1. Provala subito (modalità locale)

```bash
npm install
npm run dev
```

Senza configurazione i dati restano nel browser del dispositivo.

## 2. Database condiviso gratis (Supabase) – ~5 minuti

1. Crea un account su <https://supabase.com> → **New project** (piano Free).
2. **SQL Editor → New query**: incolla il contenuto di [`supabase/schema.sql`](supabase/schema.sql) e premi **Run**, poi fai lo stesso, in quest'ordine, con [`supabase/pods.sql`](supabase/pods.sql), [`supabase/cards.sql`](supabase/cards.sql), [`supabase/decks.sql`](supabase/decks.sql) e [`supabase/ops.sql`](supabase/ops.sql).
   Lo script si può rieseguire: quando aggiorni l'app, rilancialo per aggiungere le nuove colonne/tabelle (crea anche i tier S, 1, 2 la prima volta).
3. **Authentication → Sign In / Providers → Email**: per semplicità puoi disattivare *Confirm email*.
4. **Project Settings → API**: copia *Project URL* e la chiave *anon / public*.
5. In locale: copia `.env.example` in `.env.local` e incolla i due valori.

Ognuno si registra con email e password dall'app, ma solo con un'email autorizzata: la prima persona
che si registra diventa admin e da *Altro → Accesso* aggiunge o toglie le email degli amici.
Le tabelle sono leggibili/scrivibili solo dagli utenti loggati con email in lista (Row Level Security).

> Nota: i progetti Supabase free vengono messi in pausa dopo ~7 giorni senza alcun utilizzo; si riattivano con un clic dalla dashboard.

## 3. Pubblicala online gratis (GitHub Pages)

1. Su GitHub: **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Environments → test-env → Variables**: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
   (le stesse dell'APK; la chiave anon è pubblica per design: la protezione la fa il login + RLS).
3. Fai push su `main` (o lancia a mano il workflow *Deploy su GitHub Pages*): con Pages attivo il sito si aggiorna da solo.
4. Apri `https://<utente>.github.io/<repo>/` dal telefono → *Condividi → Aggiungi alla schermata Home*.

## Struttura

```
capacitor.config.json  configurazione app Android (Capacitor)
.github/workflows/     deploy web (Pages) e APK Android (Release)
src/
  App.tsx            navigazione + login
  lib/backend.ts     Supabase o localStorage (stessa interfaccia)
  lib/store.tsx      stato globale + sync realtime
  lib/util.ts        saldi e pareggi stile Tricount
  pages/Game.tsx     contatore vita
  pages/Trades.tsx   soldi e carte
  pages/Profiles.tsx giocatori, comandanti, tag
  pages/Stats.tsx    statistiche
supabase/schema.sql  tabelle di base
supabase/pods.sql    gruppi, ruoli, permessi (RLS)
supabase/cards.sql   conto carte, saldi, prezzi, migrazione dei vecchi prestiti
supabase/decks.sql   mazzi personali (legati all'account, in tutti i suoi gruppi)
supabase/ops.sql     scritture atomiche (più modifiche insieme: tutte o nessuna)
supabase/test/       dati e verifiche per scripts/test-sql.sh
```

Immagini e dati delle carte da [Scryfall](https://scryfall.com). Non affiliato a Wizards of the Coast.

## Test

- `npm test`: logica della partita, dei conti, delle date e delle statistiche (Vitest)
- `npm run test:sql`: installa tutti gli script SQL su un Postgres usa e getta, migra dati di prova e verifica permessi e scritture atomiche (`PGHOST`, `PGUSER`, `PGPASSWORD` come per psql; mai sul database vero)

Su GitHub li lancia il workflow **Test** a ogni push.
