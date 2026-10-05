from fit import *
# precompute
G=[]
for g in games:
    cp=[];
    for k,v in g['sc']:
        cp.append(v if k=='cp' else (10000 if v>0 else -10000) if k=='mate' else v*10000)
    cp=np.array(cp,float)
    n=len(cp)-1
    mover=np.array([1 if (i%2==0)==g['white_first'] else -1 for i in range(n)])
    G.append((cp,mover,g))

def nm(f,x0,iters=600,step=0.2):
    x0=np.array(x0,float);n=len(x0)
    pts=[x0]+[x0+np.eye(n)[i]*step*(abs(x0[i]) if x0[i] else 1) for i in range(n)]
    vals=[f(p) for p in pts]
    for _ in range(iters):
        o=np.argsort(vals);pts=[pts[i] for i in o];vals=[vals[i] for i in o]
        c=np.mean(pts[:-1],0);xr=c+(c-pts[-1]);fr=f(xr)
        if fr<vals[0]:
            xe=c+2*(c-pts[-1]);fe=f(xe)
            pts[-1],vals[-1]=(xe,fe) if fe<fr else (xr,fr)
        elif fr<vals[-2]: pts[-1],vals[-1]=xr,fr
        else:
            xc=c+0.5*(pts[-1]-c);fc=f(xc)
            if fc<vals[-1]: pts[-1],vals[-1]=xc,fc
            else:
                pts=[pts[0]+0.5*(p-pts[0]) for p in pts];vals=[f(p) for p in pts]
    i=int(np.argmin(vals));return pts[i],vals[i]

def model(params,agg='mean',rating=False,skip=0):
    def fn(g_):
        cp,mover,g=g_
        out={}
        for col,s,R in (('w',1,g['wr']),('b',-1,g['br'])):
            gr=params[0]*(1+ (params[4]*(R-1500)/1000 if rating else 0))
            ep=1/(1+np.exp(-gr*cp*s))  # EP for col
            idx=np.where(mover==s)[0]
            idx=idx[idx>=skip] if len(idx[idx>=skip]) else idx
            loss=np.maximum(0,ep[idx]-ep[idx+1])
            a=np.clip(params[1]*np.exp(-params[2]*loss)+params[3],0,100)
            if agg=='mean': out[col]=a.mean()
            elif agg=='harm': out[col]=len(a)/np.sum(1/np.maximum(a,1))
            elif agg=='mix': out[col]=(a.mean()+len(a)/np.sum(1/np.maximum(a,1)))/2
        return out
    return fn

def rmse(fn):
    e=[]
    for g_ in G:
        r=fn(g_);g=g_[2]
        e+= [r['w']-g['acc']['white'], r['b']-g['acc']['black']]
    e=np.array(e);return float(np.sqrt((e**2).mean())),float(np.abs(e).mean()),float(e.mean())

if __name__=='__main__':
    print('wintr', rmse(model([0.0035,103.16,4,-3.17],'mean')))
    for agg in ['mean','harm','mix']:
        for rating in [False,True]:
            x0=[0.0035,103.16,4,-3.17]+([0.3] if rating else [])
            x,v=nm(lambda p: rmse(model(p,agg,rating))[0] if p[0]>0 else 99,x0)
            print(agg,rating,np.round(x,5),rmse(model(x,agg,rating)))
