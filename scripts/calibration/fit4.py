from fit2 import *
import random
gr=0.0023
# fit on full with gradient free, then 5-fold CV
def fitset(idx,agg):
    sub=[G[i] for i in idx]
    def r(p):
        if p[0]<=0: return 99
        e=[]
        for g_ in sub:
            o=model(p,agg)(g_);g=g_[2];e+=[o['w']-g['acc']['white'],o['b']-g['acc']['black']]
        return float(np.sqrt(np.mean(np.square(e))))
    x,_=nm(r,[0.0023,108,19,15],iters=400,step=0.1)
    return x
random.seed(1);ids=list(range(len(G)));random.shuffle(ids)
errs=[]
for k in range(5):
    test=ids[k::5];train=[i for i in ids if i not in test]
    x=fitset(train,'mix')
    for i in test:
        o=model(x,'mix')(G[i]);g=G[i][2];errs+=[o['w']-g['acc']['white'],o['b']-g['acc']['black']]
    print('fold',k,np.round(x,5))
e=np.array(errs);print('CV MAE',np.abs(e).mean(),'RMSE',np.sqrt((e**2).mean()), 'within 3:',(np.abs(e)<3).mean(),'within 5:',(np.abs(e)<5).mean())
x=fitset(ids,'mix');print('full',np.round(x,5),rmse(model(x,'mix')))
# by time class
for tc in ['bullet','blitz','rapid','daily']:
    sub=[g_ for g_ in G if g_[2]['tc']==tc]
    e=[]
    for g_ in sub:
        o=model(x,'mix')(g_);g=g_[2];e+=[o['w']-g['acc']['white'],o['b']-g['acc']['black']]
    if e: print(tc,len(sub),'MAE',np.abs(e).mean(),'bias',np.mean(e))
