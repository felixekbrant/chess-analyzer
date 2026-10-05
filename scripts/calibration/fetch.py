import json,urllib.request,time
H={'User-Agent':'chess-analyzer calibration (personal project)'}
def get(u):
    time.sleep(0.3)
    return json.load(urllib.request.urlopen(urllib.request.Request(u,headers=H)))
users=['juanmagalhaes','chrhanson','ramon','dr_nykternstein','eugenneagoe','adih_3110','theunsolvedgambits','nguyendinhminhthien2010','erik','caleb','ao7412','tiger196223']
out=[];seen=set()
for u in users:
    try:
        arch=get(f'https://api.chess.com/pub/player/{u}/games/archives')['archives'][::-1]
    except Exception as e: print(u,e); continue
    n=0
    for a in arch[:4]:
        for g in get(a)['games'][::-1]:
            if 'accuracies' not in g or g.get('rules')!='chess' or g['url'] in seen: continue
            if g['pgn'].count('.')<25: continue
            if 'FEN' in g.get('initial_setup','') and g.get('initial_setup','').startswith('rnbqkbnr/pppppppp')==False: continue
            seen.add(g['url'])
            out.append(dict(url=g['url'],pgn=g['pgn'],acc=g['accuracies'],wr=g['white']['rating'],br=g['black']['rating'],tc=g['time_class']))
            n+=1
            if n>=12: break
        if n>=12: break
    print(u,n)
json.dump(out,open('dataset.json','w'))
print(len(out))
