"""Crea public/commanders.json: tutti i comandanti (e i background), inclusi nell'app per la ricerca offline.
Formato: {"updated": "AAAA-MM-GG", "cards": [[nome, colori "WUBRG", illustrazione art_crop | null, 1 se partner/background]]}
in ordine di popolarità EDHREC. Il telefono poi chiede a Scryfall solo i comandanti usciti dopo "updated".

Uso: python scripts/build-commanders.py all-cards-AAAAMMGG.jsonl.gz public/commanders.json
(il file "All Cards" JSONL si scarica da https://api.scryfall.com/bulk-data/all-cards -> jsonl_download_uri)
"""
import gzip
import json
import re
import sys

SKIP_LAYOUTS = {'token', 'double_faced_token', 'emblem', 'art_series', 'reversible_card'}
PAIR_KEYWORDS = ('partner', 'friends forever', "doctor's companion")


def front(c):
    faces = c.get('card_faces') or []
    return faces[0] if faces and 'type_line' in faces[0] else c


def all_text(c):
    return ' '.join([c.get('oracle_text') or ''] + [f.get('oracle_text') or '' for f in c.get('card_faces') or []])


def is_commander(c):
    # inclusivi: teniamo anche bannati e carte Un-; fuori solo le versioni giganti e le facce "fuse" (es. Brisela)
    if c.get('oversized') or c.get('set_type') == 'memorabilia':
        return False
    if any(p.get('component') == 'meld_result' and p.get('name') == c['name'] for p in c.get('all_parts') or []):
        return False
    t = (front(c).get('type_line') or c.get('type_line') or '').split(' // ')[0]
    text = all_text(c).lower()
    if 'Background' in t:
        return True
    # creature, veicoli e astronavi leggendari
    if 'Legendary' in t and any(x in t for x in ('Creature', 'Vehicle', 'Spacecraft')):
        return True
    # Grist e simili: creatura quando non è sul campo
    if 'Legendary' in t and "isn't on the battlefield, it's a" in text and 'creature' in text:
        return True
    return 'can be your commander' in text


def is_pair(c):
    kw = [k.lower() for k in c.get('keywords') or []]
    return (
        any(k.startswith(PAIR_KEYWORDS) for k in kw)
        or 'choose a background' in all_text(c).lower()
        or 'Background' in (c.get('type_line') or '')
    )


def art(c):
    return (c.get('image_uris') or {}).get('art_crop') or ((c.get('card_faces') or [{}])[0].get('image_uris') or {}).get('art_crop')


def main(src, out):
    best = {}  # oracle_id -> (punteggio stampa, carta)
    with gzip.open(src, 'rt', encoding='utf-8') as f:
        for line in f:
            line = line.strip().rstrip(',')
            if not line.startswith('{'):
                continue
            c = json.loads(line)
            if c.get('lang') != 'en' or c.get('digital') or c.get('layout') in SKIP_LAYOUTS or 'paper' not in (c.get('games') or []):
                continue
            if not is_commander(c):
                continue
            oid = c.get('oracle_id') or front(c).get('oracle_id')
            # illustrazione: preferisco stampe normali (non promo) e più recenti
            score = (0 if c.get('promo') else 1, 1 if art(c) else 0, c.get('released_at') or '')
            if oid not in best or score > best[oid][0]:
                best[oid] = (score, c)

    rows = []
    for _, c in best.values():
        colors = ''.join(x for x in 'WUBRG' if x in (c.get('color_identity') or []))
        rows.append((c.get('edhrec_rank') or 10**9, c['name'], [c['name'], colors, art(c), 1 if is_pair(c) else 0]))
    rows.sort(key=lambda r: (r[0], r[1]))

    m = re.search(r'(\d{4})(\d{2})(\d{2})\d*\.jsonl', src)
    updated = f'{m[1]}-{m[2]}-{m[3]}' if m else None
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'updated': updated, 'cards': [r[2] for r in rows]}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(rows)} comandanti ({sum(r[2][3] for r in rows)} partner/background), aggiornati al {updated} -> {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
