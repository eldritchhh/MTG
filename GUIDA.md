# Guida: dal codice all'APK sul telefono

Tempo totale: circa 20 minuti. Costo: 0 €.

## 1. Metti il codice su GitHub

Ti serve `git` installato sul PC (<https://git-scm.com>) e il file `mtg-app.bundle`.

Apri un terminale (su Windows: *Git Bash* o PowerShell) nella cartella dove hai salvato il bundle:

```bash
git clone -b main mtg-app.bundle MTG
cd MTG
git remote set-url origin https://github.com/eldritchhh/MTG.git
git push -u origin main
```

Al primo push Git ti chiede di accedere a GitHub (si apre il browser). Se il repository su GitHub
non è vuoto e il push viene rifiutato, scrivimi prima di forzare qualcosa.

## 2. Crea il database (Supabase, gratis)

1. Vai su <https://supabase.com> → **Start your project** → accedi con GitHub.
2. **New project**: nome `mtg`, scegli una password per il database (salvala), regione *Central EU (Frankfurt)*, piano **Free**.
3. Quando il progetto è pronto: menu a sinistra **SQL Editor** → **New query** → incolla tutto il file
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**. Deve dire *Success*.
4. **Authentication → Sign In / Providers → Email**: disattiva **Confirm email** (così vi registrate
   dall'app senza dover cliccare link nella mail) e salva.
5. **Project Settings → API** (o *Data API*): copia
   - **Project URL** (tipo `https://abcd1234.supabase.co`)
   - la chiave **anon public** (una stringa lunga che inizia con `eyJ`).
   Queste due non sono segrete: la protezione la fanno il login e le regole del database.

## 3. Collega GitHub al database

Su GitHub, nel repository: **Settings → Secrets and variables → Actions → tab Variables → New repository variable**:

| Nome | Valore |
|---|---|
| `VITE_SUPABASE_URL` | il Project URL |
| `VITE_SUPABASE_ANON_KEY` | la chiave anon public |

Attenzione: vanno in **Variables**, non in *Secrets*.

## 4. Fai costruire l'APK

1. Tab **Actions** del repository. Se chiede di abilitare i workflow, abilitali.
2. A sinistra **APK Android** → **Run workflow** → **Run workflow**.
3. Dopo 3-5 minuti diventa verde. Nella pagina principale del repo, a destra, compare
   **Releases → APK 1** con il file `mtg-tra-amici.apk`.

Da qui in poi l'APK si ricostruisce da solo a ogni push su `main`.

## 5. Installa sul telefono (Android)

1. Dal telefono apri la pagina del repository su GitHub → **Releases** → scarica `mtg-tra-amici.apk`
   (se il repo è privato devi essere loggato su GitHub dal telefono).
2. Apri il file: Android chiede di permettere l'installazione da questa fonte (browser o file manager) → consenti.
3. Se compare *Play Protect* dì **Installa comunque**: l'app non è sul Play Store, è normale.
4. Apri **MTG tra amici** → **Registrati** con email e password. Ogni amico fa lo stesso dal suo telefono.
5. In **Altro → Chi sei?** scegli il tuo nome (dopo averlo creato in Profili), poi **Altro → Lista comandanti → Scarica**.

Quando vi siete registrati tutti, su Supabase disattiva **Allow new users to sign up**
(Authentication → Sign In / Providers) così nessun altro può entrare.

## Aggiornare l'app sui telefoni

Senza chiave di firma ogni APK è firmato in modo diverso: per aggiornare bisogna **disinstallare e
reinstallare** (i dati non si perdono, sono su Supabase). Per aggiornare direttamente sopra, crea una
chiave una volta sola (serve Java, per esempio quello di Android Studio o <https://adoptium.net>):

```bash
keytool -genkeypair -v -keystore mtg.keystore -alias mtg -keyalg RSA -keysize 2048 -validity 10000
```

Ti chiede una password (usane una sola per tutto) e qualche dato (puoi lasciare vuoto). Poi converti il file in testo:

- Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("mtg.keystore")) | Set-Clipboard`
- Mac: `base64 -i mtg.keystore | pbcopy`
- Linux: `base64 -w0 mtg.keystore`

Su GitHub, **Settings → Secrets and variables → Actions → tab Secrets**, crea:

| Nome | Valore |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | il testo appena copiato |
| `ANDROID_KEYSTORE_PASSWORD` | la password scelta |

Conserva `mtg.keystore` e la password: se li perdi, al prossimo cambio bisogna di nuovo reinstallare.
Non metterli nel repository. Dopo aver aggiunto la chiave, disinstalla una volta l'APK di debug e installa quello nuovo.

## Alternative senza APK

- **iPhone o chi non vuole l'APK**: attiva GitHub Pages (Settings → Pages → Source: *GitHub Actions*,
  su un repo privato serve un piano GitHub a pagamento), aggiungi la variabile `ENABLE_PAGES` = `true`
  accanto alle altre due e lancia **Actions → Deploy su GitHub Pages → Run workflow**. Poi apri l'indirizzo
  `https://eldritchhh.github.io/MTG/` e scegli *Aggiungi a schermata Home*. Usa lo stesso database.
- **Provarla sul PC**: `npm install`, copia `.env.example` in `.env.local` con URL e chiave, poi `npm run dev`.
