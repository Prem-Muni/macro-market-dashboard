/* Site-local display of a model validation computed by scripts/engine.py.
 * No inference from the earlier, incompatible 15-point backtest.
 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const isNum=n=>typeof n==='number'&&Number.isFinite(n);
  const pct=n=>isNum(n)?`${n>0?'+':''}${n.toFixed(2)}%`:'—';
  const per=n=>isNum(n)?`${n.toFixed(1)}%`:'—';
  let data=null;
  const names={'RISK-ON':'Bull · Risk-On','NEUTRAL':'Balanced · Neutral','RISK-OFF':'Bear · Risk-Off'};
  const css={'RISK-ON':'good','NEUTRAL':'middle','RISK-OFF':'bad'};
  function put(id,text){const target=$(id);if(target)target.textContent=text;}
  function el(tag,klass,value){const e=document.createElement(tag);if(klass)e.className=klass;if(value!=null)e.textContent=String(value);return e;}
  function clear(node){while(node.firstChild)node.firstChild.remove();}
  function render(){
    if(!data||!$('validation-results'))return;
    const market=$('validation-market').value,h=$('validation-horizon').value;
    const m=data.markets?.[market]; if(!m)return;
    $('validation-results').hidden=false;
    const baseline=m.all_eligible.horizons[h];
    const regimeData=['RISK-ON','NEUTRAL','RISK-OFF'].map(k=>({key:k,group:m.regimes[k],stats:m.regimes[k].horizons[h]}));
    const cards=$('validation-cards'),tbody=$('validation-table-body');clear(cards);clear(tbody);
    for(const {key,group,stats} of regimeData){
      const card=el('div','validation-card '+css[key]);
      card.append(el('span','validation-label',names[key]),el('strong','validation-pct',per(stats.positive_pct)),el('span','validation-sub',`${stats.n} observed ${h}-session outcomes · ${group.signal_sessions} regime sessions`));
      const bar=el('div','validation-bar'),fill=el('span');fill.style.width=(isNum(stats.positive_pct)?Math.max(0,Math.min(100,stats.positive_pct)):0)+'%';bar.append(fill);card.append(bar);cards.append(card);
      const tr=document.createElement('tr');
      [names[key],group.signal_sessions,stats.n,per(stats.positive_pct),pct(stats.median_pct),pct(stats.mean_pct),pct(stats.worst_pct)].forEach((v,i)=>{const td=el('td',i===0?'validation-regime':'',v);tr.append(td);});
      tbody.append(tr);
    }
    const tr=document.createElement('tr');tr.className='validation-baseline';
    ['All eligible signals',m.eligible_signal_sessions,baseline.n,per(baseline.positive_pct),pct(baseline.median_pct),pct(baseline.mean_pct),pct(baseline.worst_pct)].forEach(v=>tr.append(el('td','',v)));tbody.append(tr);
    const risk=regimeData[0].stats,neutral=regimeData[1].stats,off=regimeData[2].stats;
    const relevant=risk.n>=10&&neutral.n>=10&&off.n>=10;
    put('validation-comparison', !risk.n?'No completed Risk-On forward outcomes were available in this window. That is a coverage finding, not a zero-percent success rate.':
      !relevant?'Interpret cautiously: at least one comparison group has fewer than 10 forward outcomes. The study does not support a strong performance conclusion.':
      `Risk-On positive outcomes: ${per(risk.positive_pct)} versus Neutral ${per(neutral.positive_pct)} and all eligible sessions ${per(baseline.positive_pct)}. Risk-Off negative outcomes: ${per(off.negative_pct)}. This comparison is descriptive, not proof of predictive accuracy.`);
    put('validation-nonoverlap',`Non-overlapping ${h}-session sensitivity (SPY/QQQ-specific): Risk-On ${risk.nonoverlap_n} windows with ${per(risk.nonoverlap_positive_pct)} positive; Neutral ${neutral.nonoverlap_n} with ${per(neutral.nonoverlap_positive_pct)} positive; Risk-Off ${off.nonoverlap_n} with ${per(off.nonoverlap_positive_pct)} positive.`);
    const matched=m.matched_nonoverlap?.[h],delay=m.next_close_sensitivity?.[h];
    const groupLabel=k=>k==='all'?'All eligible':names[k];
    const keys=['all','RISK-ON','NEUTRAL','RISK-OFF'];
    const target=$('validation-audit-body');if(target){
      target.replaceChildren();
      for(const key of keys){
        const non=key==='all'?matched?.all:matched?.regimes?.[key];
        const pair=key==='all'?delay?.all:delay?.regimes?.[key];
        const row=el('tr');
        [groupLabel(key),non?.n??'—',pct(non?.mean_pct),pair?.signal_close?.n??'—',pct(pair?.signal_close?.mean_pct),pct(pair?.next_close?.mean_pct)].forEach(v=>row.append(el('td','',v)));
        target.append(row);
      }
    }
    put('validation-audit-status',data.audit_version===2?'Calendar audit: '+(data.calendar_missing_price_dates?.length||0)+' missing expected price dates in the study window. Cross-regime non-overlap sample and next-close paired results are descriptive only.':'Pending the next full completed EOD build; existing historical results are preserved.');
    $('validation-export').disabled=false;
  }
  async function refresh(){
    if(!$('validation-status'))return;
    try{
      const response=await fetch('data/latest.json?validation20w='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const latest=await response.json();
      const v=latest.validation_20w;
      if(!v||v.version!==1||!v.markets?.sp||!v.markets?.nd){
        put('validation-status','The current 16-point backtest has not yet been generated. Publish the upgraded engine.py and run a successful completed EOD refresh. Existing 15-point research cannot replace this test.');
        return;
      }
      data=v;put('validation-period',`${v.start} → ${v.end} · reconstructed 16-point study`);
      put('validation-status',`Historical analysis through ${v.end}. Forward outcomes reflect completed sessions only; missing scores are excluded.${latest.repair_metadata?.research_note?' '+latest.repair_metadata.research_note:''}`);
      render();
    }catch(err){put('validation-status','Validation data unavailable: '+err.message+'. Your existing history and saved scores are unaffected.');}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if(!$('validation-view'))return;
    $('validation-market').addEventListener('change',render);
    $('validation-horizon').addEventListener('change',render);
    $('validation-export').addEventListener('click',()=>{
      if(!data)return;
      const m=data.markets[$('validation-market').value],h=$('validation-horizon').value;
      const rows=[['symbol','regime','signal_sessions','forward_observations','positive_pct','mean_pct','median_pct','worst_pct','nonoverlap_n','nonoverlap_positive_pct']];
      for(const k of ['RISK-ON','NEUTRAL','RISK-OFF']){const d=m.regimes[k],s=d.horizons[h];rows.push([m.symbol,k,d.signal_sessions,s.n,s.positive_pct,s.mean_pct,s.median_pct,s.worst_pct,s.nonoverlap_n,s.nonoverlap_positive_pct]);}
      const blob=new Blob([rows.map(a=>a.join(',')).join('\n')+'\n'],{type:'text/csv;charset=utf-8'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${m.symbol}_market_health_20week_validation_${h}sessions.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    $('refresh')?.addEventListener('click',refresh);
    if(location.hash.toLowerCase()==='#validation')refresh();
  });
  window.MarketValidation={refresh};
})();
