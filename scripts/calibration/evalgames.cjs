const path=require('path').resolve(__dirname,'../../node_modules')+'/';
const initEngine=require(path+'stockfish');
const {Chess}=require(path+'chess.js');
const fs=require('fs');
const [shard,nshards,depth]=process.argv.slice(2).map(Number);
const data=JSON.parse(fs.readFileSync('dataset.json'));
(async()=>{
  const eng=await initEngine('lite-single');
  let listener=null;
  eng.listener=(l)=>listener&&listener(l);
  const send=(c)=>eng.sendCommand(c);
  function analyze(fen){
    return new Promise(res=>{
      const lines=[];const blk=fen.split(' ')[1]==='b';
      listener=(l)=>{
        if(l.startsWith('info')&&l.includes(' pv ')){
          const t=l.split(' ');let mpv=1,sc=null,pv=null,d=0;
          for(let i=0;i<t.length;i++){if(t[i]==='multipv')mpv=+t[++i];else if(t[i]==='depth')d=+t[++i];else if(t[i]==='score'){const k=t[++i];let v=+t[++i];if(blk)v=-v;sc={k,v}}else if(t[i]==='pv'){pv=t[i+1];break}}
          if(sc)lines[mpv-1]={...sc,pv};
        } else if(l.startsWith('bestmove')){listener=null;res(lines.filter(Boolean))}
      };
      send('setoption name MultiPV value 2');send('position fen '+fen);send(`go depth ${depth} movetime 4000`);
    });
  }
  send('uci');send('setoption name Hash value 32');
  const out={};const f=`evals_d${depth}_${shard}.json`;
  for(let gi=shard;gi<data.length;gi+=nshards){
    const g=data[gi];const c=new Chess();c.loadPgn(g.pgn);
    const hist=c.history({verbose:true});
    const fens=[hist[0].before,...hist.map(m=>m.after)];
    send('ucinewgame');
    const ev=[];
    for(const fen of fens){
      const b=new Chess(fen);
      if(b.isCheckmate()){ev.push([{k:'over',v:b.turn()==='w'?-1:1}]);continue}
      if(b.isDraw()||b.isStalemate()){ev.push([{k:'over',v:0}]);continue}
      ev.push(await analyze(fen));
    }
    out[g.url]={fens,ucis:hist.map(m=>m.from+m.to+(m.promotion||'')),sans:hist.map(m=>m.san),ev};
    fs.writeFileSync(f,JSON.stringify(out));
    console.log(shard,gi);
  }
  process.exit(0);
})();
