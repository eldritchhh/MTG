# Spec: scheda Soldi e "Nuova spesa"

Riguarda **solo** la scheda **Scambi › Soldi** e il form **Nuova spesa**.

## Obiettivo
Le spese servono per regali di gruppo, spedizioni CardTrader e qualsiasi cosa pagata da uno per più persone.
Flusso: **chi ha pagato → quanto → tra chi si divide → salva.**

## 1. Form "Nuova spesa"
Un solo form, **senza** la scelta "Divisa tra più persone / Tra due persone".
1. **Per cosa** (placeholder "Es. Spedizione ordine CT0").
2. **Chi ha pagato**: chip con avatar, selezione singola, precompilato con il giocatore dell'utente.
3. **Totale (€)**: placeholder "0,00", `inputmode="decimal"`, accetta virgola e punto.
4. **Tra chi si divide**: chip multipli con "Tutti · Nessuno". Chi ha pagato ha il badge "HA PAGATO" e può essere escluso (anticipi, regali).
5. **Anteprima quota**: "14,00 € · 7 persone · 2,00 € a testa".
6. **Salva** sempre attivo: se manca qualcosa scrolla al primo campo non valido, lo evidenzia e dice cosa manca.

| Caso | Come si inserisce |
|---|---|
| Spedizione CT divisa tra tutti | pagato da X, totale, Tutti |
| Regalo di gruppo per Luigi | pagato da X, totale, tutti tranne Luigi |
| Ho pagato una cosa solo per Jimbo | pagato da me, totale, solo Jimbo |
| Spesa a metà con Jimbo | pagato da me, totale, io + Jimbo |

## 2. Scheda Soldi
Struttura invariata. Correzioni:
1. Saldo a zero → "Sei in pari" in colore neutro.
2. "Mostra saldati" è uno switch.
3. "Pagato" esegue subito, con toast "Annulla" per ~5 s.
4. Lista movimenti vuota → un solo pulsante "Aggiungi una spesa".
5. Riga movimento: titolo, "pagato da X · N persone · data", importo. Eliminazione con toast "Annulla".

## 3. Dati
Nessuna modifica al database: le vecchie spese "tra due persone" si aprono nel form unico come spese con un solo partecipante, e al salvataggio diventano righe di gruppo equivalenti. I saldi non cambiano.
I movimenti creati da un saldo carte restano a parte e aprono il dettaglio del saldo.
