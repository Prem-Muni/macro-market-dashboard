/* Market Intelligence & Risk Transitions — presentation-only helpers.
 * Uses the same published EOD score/history and scored signal metadata.
 * Does not change the 16-point model, session calculation or workflows.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  if(root)root.MarketIntel=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const VALID_STATES=new Set(['bull','bear','warn','wash']);
  const SHARED=['oil','usd','tnx','credit','copper','vix_curve'];
  const SP=['vix','sp_def','sp_xle','sp_smh','spy_trend','sp_rsi14','sp_macd','rsp_spy','iwm_spy','sp_breadth1d'];
  const ND=['vxn','nd_def','nd_xle','nd_smh','qqq_trend','nd_rsi14','nd_macd','qqqe_qqq','iwm_qqq','nd_breadth1d'];
  const RANK={'RISK-ON':0,'NEUTRAL':1,'RISK-OFF':2};
  const validNumber=n=>typeof n==='number' && Number.isInteger(n) && n>=0;
  const formatDate=s=>{
    if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return '—';
    const [yr,mo,day]=s.split('-').map(Number);
    if(!yr||mo<1||mo>12||day<1||day>31)return '—';
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo-1]} ${day}`;
  };
  const regime=v=>v<=5?'RISK-OFF':v<=10?'NEUTRAL':'RISK-ON';
  function bounds(bearish,available,total){
    if(!validNumber(bearish)||!validNumber(available)||!validNumber(total)||!total||available>total||bearish>available)return null;
    return {min:available-bearish,max:total-bearish,available,total};
  }
  function scoreRange(range){
    if(!range)return '—';
    return range.min===range.max?`${range.min}/${range.total}`:`${range.min}–${range.max}/${range.total}`;
  }
  function regimeForRange(b,market){
    if(!b)return 'INCOMPLETE';
    const low=regime(b.min,market),high=regime(b.max,market);
    return low===high?low:'INCOMPLETE';
  }
  function scoredHistory(data,market){
    const list=data?.history;
    if(!Array.isArray(list)||list.length<2)return null;
    const last=list[list.length-1],prior=list[list.length-2];
    if(!last||!prior||last.date!==data.session||!/^\d{4}-\d{2}-\d{2}$/.test(prior.date||'')||prior.date>=last.date)return null;
    const key=market==='sp'?'sp':'nd';
    const model=data.markets?.[market==='sp'?'sp500':'nasdaq100'];
    const current=model?.score;
    if(!current)return null;
    const today=bounds(current.bearish,current.available,current.total);
    const historicalToday=bounds(last[key],last[key+'_available'],current.total);
    const saved=data.published_comparison;
    const stored=saved?.markets?.[market==='sp'?'sp500':'nasdaq100'];
    const previous=saved?.session===prior.date && stored?.total===current.total && stored?.available===stored.total
      ? bounds(stored.bearish,stored.available,stored.total)
      : bounds(prior[key],prior[key+'_available'],current.total);
    // Refuse to compare history from an outdated/scaled snapshot.
    if(!today||!previous||!historicalToday||historicalToday.min!==today.min||historicalToday.max!==today.max)return null;
    const delta={min:today.min-previous.max,max:today.max-previous.min};
    const direction=delta.min>0?'improving':delta.max<0?'deteriorating':delta.min===0&&delta.max===0?'unchanged':'uncertain';
    const previousRegime=regimeForRange(previous,market);
    const currentRegime=regimeForRange(today,market);
    let transition='uncertain';
    if(previousRegime!=='INCOMPLETE'&&currentRegime!=='INCOMPLETE'){
      transition=previousRegime===currentRegime?'unchanged':RANK[currentRegime]>RANK[previousRegime]?'risk_increased':'risk_eased';
    }
    return {today,previous,delta,direction,previousRegime,currentRegime,transition,from:prior.date,to:last.date};
  }
  function divergence(sp,nd){
    if(!sp||!nd)return {kind:'unavailable',headline:'Comparison unavailable',detail:'Two matching completed market sessions are required.'};
    const directionsOpposite=(sp.direction==='improving'&&nd.direction==='deteriorating')||(sp.direction==='deteriorating'&&nd.direction==='improving');
    const knownRegimes=sp.currentRegime!=='INCOMPLETE'&&nd.currentRegime!=='INCOMPLETE';
    const regimeSplit=knownRegimes&&sp.currentRegime!==nd.currentRegime;
    if(directionsOpposite)return {kind:'diverging',headline:'Opposite daily risk moves',detail:`SPY is ${sp.direction} while QQQ is ${nd.direction}.${regimeSplit?' The two benchmarks are also in different risk regimes.':''}`};
    if(regimeSplit)return {kind:'split',headline:'Risk regimes diverge',detail:`SPY: ${sp.currentRegime} · QQQ: ${nd.currentRegime}.`};
    if(!knownRegimes||sp.direction==='uncertain'||nd.direction==='uncertain')return {kind:'uncertain',headline:'Divergence uncertain',detail:'Missing scored inputs prevent a definitive comparison; unavailable signals are not treated as healthy.'};
    return {kind:'aligned',headline:'No confirmed divergence',detail:`SPY ${sp.direction}; QQQ ${nd.direction}. Both risk regimes: ${sp.currentRegime}.`};
  }
  function quality(data,market){
    const model=data?.markets?.[market==='sp'?'sp500':'nasdaq100'];
    const s=model?.score;
    const keys=SHARED.concat(market==='sp'?SP:ND);
    if(!s||!validNumber(s.available)||s.total!==keys.length||s.available>s.total)return null;
    const missing=[],estimated=[],unspecified=[];
    let counted=0;
    for(const key of keys){
      const sig=data.signals?.[key]||{};
      if(!VALID_STATES.has(sig.state)){missing.push(key);continue;}
      counted++;
      if(/ESTIMAT|EXPERIMENTAL|PROXY|CONSTITUENT.DERIVED/i.test(sig.source||''))estimated.push(key);
      if(!String(sig.source||'').trim())unspecified.push(key);
    }
    return {available:s.available,total:s.total,missing:s.total-s.available,estimated,unspecified,
      mismatch:counted!==s.available||missing.length!==s.total-s.available};
  }
  return {bounds,scoreRange,regimeForRange,scoredHistory,divergence,quality,formatDate};
});
