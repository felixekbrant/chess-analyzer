"""Downloads chess.com games that have been reviewed (they carry chess.com's accuracy) into dataset.json.

Usage: python3 fetch.py [target_games] [per_player]
Starts from a few seed players and then follows their opponents, so ratings spread out naturally.
Requests are sequential and spaced out, as chess.com asks.
"""
import json, sys, time, urllib.request
from collections import deque

H = {'User-Agent': 'chess-analyzer calibration (personal project)'}
TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 130
PER_PLAYER = int(sys.argv[2]) if len(sys.argv) > 2 else 12


def get(u):
    time.sleep(0.3)
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=30))


seeds = ['juanmagalhaes', 'chrhanson', 'ramon', 'dr_nykternstein', 'eugenneagoe', 'adih_3110', 'theunsolvedgambits',
         'nguyendinhminhthien2010', 'erik', 'caleb', 'ao7412', 'tiger196223']
queue, queued = deque(seeds), set(seeds)
out, seen = [], set()
while queue and len(out) < TARGET:
    u = queue.popleft()
    try:
        arch = get(f'https://api.chess.com/pub/player/{u}/games/archives')['archives'][::-1]
    except Exception as e:
        print(u, e)
        continue
    n = 0
    for a in arch[:4]:
        try:
            games = get(a)['games'][::-1]
        except Exception as e:
            print(a, e)
            continue
        for g in games:
            for side in ('white', 'black'):
                opp = g[side]['username'].lower()
                if opp not in queued:
                    queued.add(opp)
                    queue.append(opp)
            if 'accuracies' not in g or g.get('rules') != 'chess' or g['url'] in seen:
                continue
            if g['pgn'].count('.') < 25:
                continue
            if 'FEN' in g.get('initial_setup', '') and not g.get('initial_setup', '').startswith('rnbqkbnr/pppppppp'):
                continue
            seen.add(g['url'])
            out.append(dict(url=g['url'], pgn=g['pgn'], acc=g['accuracies'], wr=g['white']['rating'], br=g['black']['rating'], tc=g['time_class']))
            n += 1
            if n >= PER_PLAYER:
                break
        if n >= PER_PLAYER:
            break
    print(u, n, len(out), flush=True)
json.dump(out[:TARGET], open('dataset.json', 'w'))
print(len(out[:TARGET]))
