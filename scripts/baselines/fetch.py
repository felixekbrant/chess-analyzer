"""Samples rated chess.com games across rating bands and time classes for the skill baselines.

Each game contributes one sample per side; a side's sample goes to the cell (time class, rating band)
of that player's rating. Players are explored best-first, preferring ratings in cells that still
need samples. Requests are sequential, as chess.com asks. Output: games.json
"""
import heapq, json, random, sys, time, urllib.request

H = {'User-Agent': 'chess-analyzer skill baselines (personal, non-commercial project)'}
BANDS = list(range(400, 2401, 200))
CLASSES = ['bullet', 'blitz', 'rapid']
CAP = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 40
MAX_REQUESTS = 1500
SEEDS = ['erik', 'caleb', 'ramon', 'chrhanson', 'dr_nykternstein', 'eugenneagoe', 'theunsolvedgambits',
         'ao7412', 'tiger196223', 'nguyendinhminhthien2010', 'juanmagalhaes', 'adih_3110']

def band(r):
    return max(400, min(2400, r // 200 * 200))

requests = 0
def get(url):
    global requests
    requests += 1
    time.sleep(0.25)
    for attempt in range(4):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=30))
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(5 * (attempt + 1)); continue
            if e.code in (404, 410): return None
            raise
        except Exception:
            time.sleep(2)
    return None

count = {(c, b): 0 for c in CLASSES for b in BANDS}
def need(c, r):
    # The top band means 2400-2599; stronger players would skew it.
    return c in CLASSES and r < 2600 and count[(c, band(r))] < CAP

def priority(rating):
    # Lower is better: players whose band is emptiest across classes come first.
    b = band(rating)
    return min(count[(c, b)] for c in CLASSES) + random.random()

out, seen_games, seen_players = [], set(), set()
heap = [(0, s, 0) for s in SEEDS]
random.seed(7)
# Resume: keep what was collected and count it.
try:
    out = json.load(open('games.json'))
    for g in out:
        seen_games.add(g['url'])
        for side in g['sides']:
            count[(g['tc'], band(g['wr'] if side == 'w' else g['br']))] += 1
except FileNotFoundError:
    pass
# Strong players are rare among everyone's opponents; titled players (mostly 2000-2600 online) fill
# the top bands.
if '--titled' in sys.argv:
    for title in ['CM', 'NM', 'WFM', 'WCM', 'FM']:
        t = get(f'https://api.chess.com/pub/titled/{title}') or {}
        names = t.get('players', [])
        random.shuffle(names)
        heap += [(-1, n.lower(), 0) for n in names[:150]]
    heapq.heapify(heap)
while heap and requests < MAX_REQUESTS and any(v < CAP for v in count.values()):
    _, user, _r = heapq.heappop(heap)
    if user in seen_players: continue
    seen_players.add(user)
    arch = get(f'https://api.chess.com/pub/player/{user}/games/archives')
    if not arch or not arch.get('archives'): continue
    month = get(arch['archives'][-1])
    if not month: continue
    taken = 0
    for g in reversed(month.get('games', [])):
        if taken >= 3: break
        if g.get('rules') != 'chess' or not g.get('rated') or g['url'] in seen_games: continue
        c = g.get('time_class')
        if c not in CLASSES or 'FEN' in g.get('initial_setup', '')[:0]: continue
        if g.get('initial_setup') and not g['initial_setup'].startswith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'): continue
        pgn = g.get('pgn', '')
        if pgn.count('.') < 30: continue  # at least ~15 moves
        wr, br = g['white']['rating'], g['black']['rating']
        if not (need(c, wr) or need(c, br)): continue
        seen_games.add(g['url'])
        sides = []
        for side, r in (('w', wr), ('b', br)):
            if need(c, r):
                count[(c, band(r))] += 1
                sides.append(side)
        out.append(dict(url=g['url'], pgn=pgn, tc=c, wr=wr, br=br, sides=sides,
                        wres=g['white']['result'], bres=g['black']['result']))
        taken += 1
    for g in month.get('games', [])[-30:]:
        for side in ('white', 'black'):
            p = g[side]
            if p['username'].lower() not in seen_players:
                heapq.heappush(heap, (priority(p['rating']), p['username'].lower(), p['rating']))
    if len(seen_players) % 25 == 0:
        json.dump(out, open('games.json', 'w'))
        full = sum(v >= CAP for v in count.values())
        print(f'{requests} requests, {len(out)} games, {full}/{len(count)} cells full', flush=True)

json.dump(out, open('games.json', 'w'))
print('done', requests, 'requests', len(out), 'games')
for c in CLASSES:
    print(c, ' '.join(f'{b}:{count[(c, b)]}' for b in BANDS))
