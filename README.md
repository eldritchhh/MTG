# MTG tra amici

Web app (installabile sul telefono) per il gruppo di Magic:

- **Partita** – contatore vita per 2–6 giocatori con mazzo scelto, danni da comandante, veleno, timer, vista "tavolo" con metà schermo capovolta. A fine partita scegli il vincitore e viene salvata nelle statistiche.
- **Scambi**
  - *Soldi*: stile Tricount. Debiti tra due persone ("Luca deve 4 € a Francesco per Sol Ring") o **spese divise tra più persone** ("Francesco ha pagato 14 € di spedizione dell'ordine CT0" diviso tra 4, quote uguali o personalizzate). Saldi netti e pareggi minimi ("Marco → Francesco 2,50 €").
  - *Carte*: chi ha dato quali carte a chi, con stato **In prestito / Definitivo / Restituito**.
- **Profili** – giocatori e i loro comandanti. La ricerca propone **solo comandanti** (anche partner/background) e imposta di default l'illustrazione della carta e l'identità di colore. Tag, ricerca per tag e **tier**.
- **Tier dinamici** (es. S, 1, 2) – si aggiungono, rinominano e riordinano da *Altro → Tier*. Ogni partita salva il tier che il mazzo aveva quel giorno: il filtro per tier delle statistiche usa quello, così i numeri non cambiano quando spostate un mazzo di tier.
- **Statistiche** – vittorie e % (vinte su giocate) per mazzo, giocatore, tag e colore; storico partite; filtri per periodo (30/90 giorni) e per **tier**.
- **Lista comandanti** – da *Altro → Lista comandanti* la scarichi da Scryfall e la aggiorni quando vuoi (es. dopo un nuovo set): la ricerca diventa istantanea e funziona offline. Senza lista, la ricerca avviene online.
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
2. **SQL Editor → New query**: incolla il contenuto di [`supabase/schema.sql`](supabase/schema.sql) e premi **Run**.
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
2. **Settings → Secrets and variables → Actions → Variables**: aggiungi
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (la chiave anon è pubblica per design: la protezione la fa il login + RLS).
3. Fai push su `main` (o lancia a mano il workflow *Deploy su GitHub Pages*).
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
supabase/schema.sql  tabelle, sicurezza, realtime
```

Immagini e dati delle carte da [Scryfall](https://scryfall.com). Non affiliato a Wizards of the Coast.
