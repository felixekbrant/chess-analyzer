"""Builds the themed puzzle packs in public/puzzles/ from the Lichess puzzle database (CC0).

Usage (Python 3 with `pip install zstandard`):
    curl -O https://database.lichess.org/lichess_db_puzzle.csv.zst
    python3 build.py lichess_db_puzzle.csv.zst ../../public/puzzles

Each pack holds well-rated, often-played puzzles for one of the app's skill areas
(src/lib/insights/skills.ts) and one rating band, so a phone only downloads the ~20 KB it needs.
The selection is deterministic: the same database gives the same packs.
"""
import csv, hashlib, io, json, os, sys
import zstandard

PER_PACK = 150
# Lichess puzzle-rating bands; the app picks the band from the player's rating.
BANDS = [(0, 1000), (1000, 1300), (1300, 1600), (1600, 1900), (1900, 2200), (2200, 4000)]


def areas_for(themes):
    """Skill areas a puzzle trains, from its Lichess themes. 'time' has no puzzle equivalent."""
    t = set(themes)
    out = []
    if t & {'hangingPiece', 'trappedPiece'}:
        out.append('blunder_check')
    if t & {'fork', 'pin', 'skewer', 'discoveredAttack', 'backRankMate', 'doubleCheck', 'xRayAttack', 'deflection', 'attraction'}:
        out.append('opp_tactics')
    if t & {'mateIn2', 'mateIn3', 'sacrifice', 'attackingF2F7', 'exposedKing'}:
        out.append('chances')
    if 'opening' in t:
        out.append('opening')
    if 'advantage' in t and 'long' in t:
        out.append('converting')
    if t & {'defensiveMove', 'equality'}:
        out.append('defending')
    if 'endgame' in t:
        out.append('endgame')
    if 'middlegame' in t and t & {'quietMove', 'advancedPawn', 'zugzwang', 'intermezzo'}:
        out.append('middlegame')
    return out


def main(src, dest):
    picked = {}
    with open(src, 'rb') as f:
        rows = csv.DictReader(io.TextIOWrapper(zstandard.ZstdDecompressor(max_window_size=2**31).stream_reader(f), encoding='utf8'))
        for r in rows:
            if int(r['Popularity']) < 85 or int(r['NbPlays']) < 300 or int(r['RatingDeviation']) > 90:
                continue
            rating = int(r['Rating'])
            band = next(i for i, (lo, hi) in enumerate(BANDS) if lo <= rating < hi)
            themes = r['Themes'].split()
            # A stable pseudo-random order, so packs mix games and openings instead of following the file.
            key = hashlib.sha1(r['PuzzleId'].encode()).hexdigest()
            item = (key, [r['PuzzleId'], r['FEN'], r['Moves'], rating, ' '.join(themes)])
            for area in areas_for(themes):
                bucket = picked.setdefault((area, band), [])
                bucket.append(item)
                if len(bucket) > PER_PACK * 4:
                    bucket.sort()
                    del bucket[PER_PACK:]
    os.makedirs(dest, exist_ok=True)
    index = {}
    for (area, band), items in sorted(picked.items()):
        items.sort()
        puzzles = sorted((p for _, p in items[:PER_PACK]), key=lambda p: p[3])
        lo, hi = BANDS[band]
        name = f'{area}-{lo}.json'
        with open(os.path.join(dest, name), 'w') as out:
            json.dump({'area': area, 'min': lo, 'max': hi, 'puzzles': puzzles}, out, separators=(',', ':'))
        index.setdefault(area, []).append([lo, hi, len(puzzles)])
        print(name, len(puzzles))
    with open(os.path.join(dest, 'index.json'), 'w') as out:
        json.dump({'source': 'Lichess puzzle database (CC0), database.lichess.org', 'packs': index}, out, separators=(',', ':'))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
