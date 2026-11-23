/* Price vs. Risk Divergence Alert
 * Presentation-only comparison of SAME-session published EOD closes and scored regimes.
 * Uses price_moves from the EOD updater. Never fetches intraday quotes or changes a score.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  if(root)root.PriceRisk=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const MOVE_THRESHOLD=2.0; // percent of prior completed-session close
  const finite=(n)=>typeof n==='number' && Number.isFinite(n);
  const date=(s)=>typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const pctText=n=>!finite(n)?'—':`${n>0?'+':''}${n.toFixed(2)}%`;
  const closeText=n=>finite(n)?`$${n.toFixed(2)}`:'—';
  const moveText=n=>Math.abs(n)>=MOVE_THRESHOLD?'large':'normal';
  const unavailable=(detail='Price/risk comparison unavailable until the next completed EOD refresh.')=>({
    kind:'unavailable',headline:'Awaiting matched EOD data',detail,price:null,
    regime:null,previousClose:null,close:null,from:null,to:null,scoreLine:null
  });

  function evaluate(data, market, scored){
    if(market!=='sp' && market!=='nd')return unavailable();
    const key=market==='sp'?'spy':'qqq',symbol=key.toUpperCase();
    const move=data?.price_moves,price=move?.[key];
    const ma=data?.moving_averages?.[key];
    if(move?.status==='awaiting_close')return unavailable('The latest market session is still in progress. Price/risk alerts require completed EOD closes.');
    if(move?.status!=='complete'||!price||!scored)
      return unavailable('The price comparison is not yet in the published snapshot. Run the upgraded EOD workflow after the market closes.');
    if(!date(move.session)||!date(move.previous_session)||move.previous_session>=move.session||
       move.session!==data.session||move.session!==scored.to||move.previous_session!==scored.from)
      return unavailable('Price and risk records reference different trading sessions; no divergence is inferred.');
    const {previous_close:p,close:c,change_pct:change}=price;
    if(!finite(p)||!finite(c)||!finite(change)||p<=0||c<=0||
       Math.abs(((c/p)-1)*100-change)>.025)
      return unavailable('Price records are missing or inconsistent; the alert is suppressed.');
    if(!ma||ma.as_of!==move.session||!finite(ma.close)||Math.abs(ma.close-c)>.015)
      return unavailable('Price records do not match the published latest EOD close; the alert is suppressed.');
    const base={price:change,from:move.previous_session,to:move.session,previousClose:p,close:c,
      regime:scored.currentRegime,scoreLine:null};
    if(!scored.today||scored.today.total!==15||scored.today.min!==scored.today.max||
       scored.currentRegime==='INCOMPLETE')
      return {...base,kind:'uncertain',headline:'Score coverage incomplete',detail:`${symbol} moved ${pctText(change)}, but the current risk score cannot be confirmed; no divergence is asserted.`};
    const current=scored.today.min;
    const scoreLine=`${current}/15 bearish points · ${scored.currentRegime}`;
    const changeDesc={improving:'fewer bearish signals than the prior session',
      deteriorating:'more bearish signals than the prior session',
      unchanged:'no change in bearish-point count',
      uncertain:'a prior-day score change that cannot be determined with certainty'}[scored.direction]||'an unavailable score change';
    const common={...base,scoreLine};
    const shift=`The 15-point model shows ${changeDesc}.`;
    if(change>=MOVE_THRESHOLD){
      if(scored.currentRegime==='RISK-OFF')return {...common,kind:'divergence',headline:'Strong rally · Risk-Off persists',
        detail:`${symbol} gained ${pctText(change)} in one session, yet ${current}/15 bearish signals still place it in Risk-Off. ${shift} A rebound alone is not a confirmed regime recovery.`};
      if(scored.currentRegime==='CAUTION')return {...common,kind:'watch',headline:'Strong rally · Caution remains',
        detail:`${symbol} gained ${pctText(change)}, but the 15-point model remains in Caution (${current}/15). ${shift}`};
      return {...common,kind:'aligned',headline:'Rally aligns with Risk-On',
        detail:`${symbol} gained ${pctText(change)} and the 15-point score is Risk-On (${current}/15). ${shift}`};
    }
    if(change<=-MOVE_THRESHOLD){
      if(scored.currentRegime==='RISK-ON')return {...common,kind:'divergence',headline:'Sharp selloff · Risk-On persists',
        detail:`${symbol} fell ${pctText(change)} in one session while the 15-point score remains Risk-On (${current}/15). ${shift} Watch for subsequent risk deterioration.`};
      if(scored.currentRegime==='CAUTION')return {...common,kind:'watch',headline:'Sharp selloff · Caution regime',
        detail:`${symbol} fell ${pctText(change)} and the risk score remains in Caution (${current}/15). ${shift}`};
      return {...common,kind:'aligned',headline:'Selloff aligns with Risk-Off',
        detail:`${symbol} fell ${pctText(change)} while the risk model remains Risk-Off (${current}/15). ${shift}`};
    }
    return {...common,kind:'neutral',headline:'No large price/risk mismatch',
      detail:`${symbol} moved ${pctText(change)} (below the ±${MOVE_THRESHOLD.toFixed(0)}% alert threshold). Current risk: ${scored.currentRegime} (${current}/15).`};
  }
  function summary(sp,nd){
    const alerts=[sp,nd].filter(x=>x.kind==='divergence').length;
    const watch=[sp,nd].filter(x=>x.kind==='watch').length;
    const incomplete=[sp,nd].filter(x=>x.kind==='unavailable'||x.kind==='uncertain').length;
    if(alerts)return {tone:'warn',headline:alerts===2?'Price/risk divergence in both ETFs':'Price/risk divergence detected',
      detail:'Strong daily price moves disagree with the current 15-point risk regime. Review both readings before interpreting the rebound or selloff.'};
    if(watch)return {tone:'watch',headline:'Strong moves within Caution',detail:'The price move is significant, but at least one risk regime has not reached Risk-On or Risk-Off.'};
    if(incomplete)return {tone:'neutral',headline:'Price/risk check incomplete',detail:'A matched completed EOD price comparison and a classifiable score are required.'};
    return {tone:'neutral',headline:'No flagged price/risk divergence',detail:'Price moves and the model do not meet the mismatch rules for this session.'};
  }
  return {MOVE_THRESHOLD,evaluate,summary,pctText,closeText,moveText};
});
