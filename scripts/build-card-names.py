"""Crea public/cards.json: nome inglese di ogni carta + nome italiano (se esiste), incluso nell'app.
Il telefono poi chiede a Scryfall solo le carte uscite dopo la data "updated" (Altro -> Lista carte).

Uso (una volta ogni tanto, per rinfrescare la base):
  1. scarica il file "All Cards" in formato JSONL da https://scryfall.com/docs/api/bulk-data
     (https://api.scryfall.com/bulk-data/all-cards -> jsonl_download_uri, circa 400 MB)
  2. python scripts/build-card-names.py all-cards-AAAAMMGG.jsonl.gz public/cards.json
"""
import gzip
import json
import re
import sys

# non sono carte da scambiare
SKIP_LAYOUTS = {'token', 'double_faced_token', 'emblem', 'art_series'}


def italian_name(c):
    if c.get('printed_name'):
        return c['printed_name']
    faces = c.get('card_faces') or []
    names = [f.get('printed_name') for f in faces]
    return ' // '.join(names) if faces and all(names) else None


def main(src, out):
    names = {}  # oracle_id -> nome inglese
    first = {}  # oracle_id -> prima data di uscita (qualsiasi lingua)
    italian = {}  # oracle_id -> (data della stampa italiana più recente, nome italiano)
    bulk_date = None
    with gzip.open(src, 'rt', encoding='utf-8') as f:
        for line in f:
            line = line.strip().rstrip(',')
            if not line.startswith('{'):
                continue
            c = json.loads(line)
            if c.get('layout') in SKIP_LAYOUTS or c.get('digital'):
                continue
            oid = c.get('oracle_id') or ((c.get('card_faces') or [{}])[0].get('oracle_id'))
            if not oid:
                continue
            rel = c.get('released_at') or '9999-12-31'
            names.setdefault(oid, c['name'])
            first[oid] = min(first.get(oid, rel), rel)
            if c.get('lang') == 'it':
                it = italian_name(c)
                if it and (oid not in italian or rel > italian[oid][0]):
                    italian[oid] = (rel, it)

    m = re.search(r'(\d{4})(\d{2})(\d{2})\d*\.jsonl', src)
    bulk_date = f'{m[1]}-{m[2]}-{m[3]}' if m else max(first.values())

    by_name = {}
    for oid, name in names.items():
        it = italian.get(oid, (None, None))[1]
        if name not in by_name or (it and not by_name[name]):
            by_name[name] = it
    # [inglese] oppure [inglese, italiano]
    cards = [[n, by_name[n]] if by_name[n] else [n] for n in sorted(by_name, key=str.lower)]
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'updated': bulk_date, 'cards': cards}, f, ensure_ascii=False, separators=(',', ':'))
    n_it = sum(1 for c in cards if len(c) > 1)
    print(f'{len(cards)} carte, {n_it} con nome italiano, base aggiornata al {bulk_date} -> {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
