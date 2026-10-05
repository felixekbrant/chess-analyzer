import json,glob,math,numpy as np,sys
D=int(sys.argv[1]) if len(sys.argv)>1 else 14
data={g['url']:g for g in json.load(open('dataset.json'))}
ev={}
for f in glob.glob(f'evals_d{D}_*.json'): ev.update(json.load(open(f)))
games=[]
for url,e in ev.items():
    g=data[url]
    sc=[]
    for lines in e['ev']:
        l=lines[0]
        sc.append((l['k'],l['v']))
    games.append(dict(url=url,sc=sc,acc=g['acc'],wr=g['wr'],br=g['br'],tc=g['tc'],white_first=e['fens'][0].split()[1]=='w'))
print(len(games),'games')

def wp_lichess(s):
    k,v=s
    if k=='cp': c=max(-1000,min(1000,v)); return 50+50*(2/(1+math.exp(-0.00368208*c))-1)
    if k=='mate': return 100 if v>0 else 0
    return 50+50*v

def lichess_game(g):
    ww=[wp_lichess(s) for s in g['sc']]
    n=len(ww)-1; ws=max(2,min(8,n//10))
    wins=[ww[:ws]]*max(0,ws-2)+[ww[i:i+ws] for i in range(0,len(ww)-ws+1)]
    wts=[max(0.5,min(12,float(np.std(w)))) for w in wins]
    acc={'w':[],'b':[]}
    for i in range(n):
        c='w' if (i%2==0)==g['white_first'] else 'b'
        p,q=(ww[i],ww[i+1]) if c=='w' else (100-ww[i],100-ww[i+1])
        a=100 if q>=p else max(0,min(100,103.1668*math.exp(-0.04354*(p-q))-3.1669+1))
        acc[c].append((a,wts[i] if i<len(wts) else 1))
    out={}
    for c,xs in acc.items():
        tw=sum(w for _,w in xs); wm=sum(a*w for a,w in xs)/tw
        hm=len(xs)/sum(1/max(a,1) for a,_ in xs)
        out[c]=(wm+hm)/2
    return out

def report(name,fn):
    err=[];pairs=[]
    for g in games:
        r=fn(g)
        for c,k in (('w','white'),('b','black')):
            err.append(r[c]-g['acc'][k]); pairs.append((r[c],g['acc'][k]))
    e=np.array(err)
    print(f'{name:40s} bias {e.mean():+.2f}  MAE {np.abs(e).mean():.2f}  RMSE {np.sqrt((e**2).mean()):.2f}')
    return np.sqrt((e**2).mean())

if __name__=='__main__':
    report('current (lichess)',lichess_game)
