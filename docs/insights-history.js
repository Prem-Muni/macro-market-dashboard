/* Saved EOD market-insight journal. Uses only market_insights_history in latest.json.
 * No external API calls, no inferred past alerts, no impact on the scoring engine.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.InsightsHistory=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const isNum=v=>typeof v==='number'&&Number.isFinite(v);
  const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));
  const dateLabel=s=>validDate(s)?new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'—';
  const money=v=>isNum(v)?'$'+v.toFixed(2):'—';
  const signed=(v,suffix='')=>isNum(v)?`${v>0?'+':''}${v.toFixed(suffix==='%'?2:0)}${suffix}`:'—';
  const text=(value)=>value==null?'—':String(value);
  const REGIMES=['RISK-ON','NEUTRAL','CAUTION','RISK-OFF','INCOMPLETE'];
  const KINDS=['divergence','watch','aligned','none','uncertain'];
  const ALL_MARKETS=['spy','qqq'];

  function validArchive(data){
    const archive=data?.market_insights_history;
    if(!archive||archive.version!==1||!Array.isArray(archive.entries))return [];
    const entries=archive.entries;
    if(!entries.every(row=>row&&validDate(row.session)&&validDate(row.previous_session)&&row.previous_session<row.session&&
       ALL_MARKETS.every(k=>row[k]&&REGIMES.includes(row[k].regime)&&KINDS.includes(row[k].price_risk_status))))return [];
    if(entries.some((entry,i)=>i>0&&entry.session<=entries[i-1].session))return [];
    return entries;
  }
  // Persistent JSON uses raw bearish counts to retain historical comparability.
  // Convert only at display/export boundaries; never mutate the saved archive.
  const healthRegime=v=>v<=5?'RISK-OFF':v<=10?'NEUTRAL':'RISK-ON';
  function healthView(d,baseline=false){
    if(!d||!isNum(d.score)||!isNum(d.total)||!isNum(d.available))return d;
    const available=d.available,total=d.total,raw=d.score;
    const min=available-raw,max=total-raw;
    const regime=healthRegime(min)===healthRegime(max)?healthRegime(min):'INCOMPLETE';
    const previous=isNum(d.previous_score)?total-d.previous_score:null;
    const previousRegime=previous==null?'INCOMPLETE':healthRegime(previous);
    const change=isNum(d.score_delta_1d)?-d.score_delta_1d:null;
    const priorRange=d.five_day_delta_range;
    const fiveDayRange=Array.isArray(priorRange)&&priorRange.length===2&&priorRange.every(isNum)?[-priorRange[1],-priorRange[0]]:null;
    const price=d.price_change_pct;
    let status=d.price_risk_status,label=d.price_risk_label;
    if(!baseline && isNum(price) && regime!=='INCOMPLETE' && d.price_risk_status!=='uncertain' && d.price_risk_status!=='unavailable'){
      if(price>=2 && regime==='RISK-OFF'){status='divergence';label='Strong rally · Risk-Off persists';}
      else if(price<=-2 && regime==='RISK-ON'){status='divergence';label='Sharp selloff · Risk-On persists';}
      else if(Math.abs(price)>=2 && regime==='NEUTRAL'){status='watch';label='Large price move · Neutral regime';}
      else {status='none';label='No price/risk divergence under current health thresholds';}
    }
    return {...d,score:min,score_max:max,previous_score:previous,score_delta_1d:change,
      regime,previous_regime:previousRegime,risk_transition:previous==null?'uncertain':previousRegime===regime?'unchanged':'changed',
      five_day_delta_range:fiveDayRange,price_risk_status:status,price_risk_label:label,
      archived_bearish:raw};
  }
  function filterRows(entries,options={}){
    const range=options.range||'all',market=options.market||'both',alertsOnly=!!options.alertsOnly;
    const last=entries.at(-1)?.session;
    let cutoff=null;
    if(last && range!=='all'){
      const d=new Date(last+'T12:00:00Z');
      if(range==='ytd') d.setUTCMonth(0,1);
      else {const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-({m1:1,m3:3,m6:6}[range]||1));const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,end));}
      cutoff=d.toISOString().slice(0,10);
    }
    const sessions=range==='30'||range==='90'?entries.slice(-Number(range)):cutoff?entries.filter(e=>e.session>=cutoff):entries;
    const selected=market==='both'?ALL_MARKETS:ALL_MARKETS.includes(market)?[market]:ALL_MARKETS;
    const rows=[];
    for(const day of sessions.slice().reverse()){
      const spy=healthView(day.spy,day.baseline===true);
      const qqq=healthView(day.qqq,day.baseline===true);
      let marketDivergence='aligned';
      if(spy.regime==='INCOMPLETE'||qqq.regime==='INCOMPLETE')marketDivergence='uncertain';
      else if(isNum(spy.score_delta_1d)&&isNum(qqq.score_delta_1d)&&
        (spy.score_delta_1d<0&&qqq.score_delta_1d>0 || spy.score_delta_1d>0&&qqq.score_delta_1d<0))
        marketDivergence='opposite_score_moves';
      else if(spy.regime!==qqq.regime)marketDivergence='regime_split';
      else if(!isNum(spy.score_delta_1d)||!isNum(qqq.score_delta_1d))marketDivergence='uncertain';
      for(const sym of selected){
        const view=sym==='spy'?spy:qqq;
        if(alertsOnly&&view.price_risk_status!=='divergence')continue;
        rows.push({session:day.session,previous_session:day.previous_session,symbol:sym,detail:view,changes:day.signal_changes,
          marketDivergence,recordSource:day.record_source||"automatic_eod",sourceNote:day.source_note||"",baseline:day.baseline===true,summary:day.summary,sharedSnapshot:day.shared_macro_snapshot,sentiment:day.external_sentiment_snapshot});
      }
    }
    return rows;
  }
  function csvField(v){
    let s=v==null?'':String(v);
    // Prevent spreadsheet formula injection from market/provider supplied text.
    if(!isNum(v)&&/^[\s]*[=+@\-]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }
  const sharedKeys=['oil','usd','tnx','credit','copper','vix_curve'];
  const marketKeys={spy:['vix','sp_def','sp_xle','sp_smh','spy_trend','sp_rsi14','rsp_spy','iwm_spy','sp_breadth1d','sp_macd','sp_breadth5d','sp_breadth200'],qqq:['vxn','nd_def','nd_xle','nd_smh','qqq_trend','nd_rsi14','qqqe_qqq','iwm_qqq','nd_breadth1d','nd_macd','nd_breadth5d']};
  const names={oil:'Crude Oil',usd:'US Dollar',tnx:'10Y Yield',credit:'Credit HYG/IEF',copper:'Copper',vix_curve:'VIX Curve',vix:'VIX',vxn:'VXN',sp_def:'Defensives/SPY',nd_def:'Defensives/QQQ',sp_xle:'XLE/SPY',nd_xle:'XLE/QQQ',sp_smh:'SMH/SPY',nd_smh:'SMH/QQQ',spy_trend:'SPY Trend',qqq_trend:'QQQ Trend',sp_rsi14:'SPY RSI',nd_rsi14:'QQQ RSI',rsp_spy:'RSP/SPY',qqqe_qqq:'QQQE/QQQ',iwm_spy:'IWM/SPY',iwm_qqq:'IWM/QQQ',sp_breadth1d:'S&P Breadth 1D',sp_breadth5d:'S&P Breadth 5D',sp_breadth200:'S&P Breadth 200D',nd_breadth1d:'Nasdaq Breadth 1D',nd_breadth5d:'Nasdaq Breadth 5D',sp_macd:'SPY MACD',nd_macd:'QQQ MACD'};
  const labels=v=>Array.isArray(v)?v.map(x=>x.label||'').join('; '):null;
  function signal(row,key){
    const d=row.detail,b=d.baseline_context||{};
    if(d.metrics?.signals?.[key])return d.metrics.signals[key];
    if((key==='vix'||key==='vxn')&&b.volatility_index)return {...b.volatility_index,label:b.volatility_index.state,source:'Screenshot baseline'};
    if(sharedKeys.includes(key)&&row.sharedSnapshot?.[key]!=null)return {label:row.sharedSnapshot[key],value:key==='vix_curve'?row.sharedSnapshot.vix_curve_ratio:null,source:'Screenshot baseline'};
    if(key.endsWith('_rsi14')&&isNum(b.rsi14))return {value:b.rsi14,source:'Screenshot baseline'};
    const match=key.match(/_breadth(1d|5d|200)$/);
    if(match){const v=b['breadth_'+(match[1]==='200'?'200d':match[1])];if(v)return {...v,label:v.state,source:'Screenshot baseline'};}
    const changes=row.changes;
    if(changes?.status==='complete'||changes?.status==='partial'){
      const g=changes.groups?.[sharedKeys.includes(key)?'shared':row.symbol==='spy'?'sp':'nd'];
      const matching=[...(g?.eased||[]),...(g?.new_bearish||[]),...(g?.other||[])].find(x=>x.label===names[key] || x.label===names[key]+' (14)' || x.label===names[key]+' (12,26,9)');
      if(matching?.after)return {label:matching.after,source:'Recorded signal change (state only)'};
    }
    return {};
  }
  function groupHealth(row,keys,baselineCount){
    if(isNum(baselineCount))return `${keys.length-baselineCount}/${keys.length}`;
    const vals=keys.map(k=>row.detail.metrics?.signals?.[k]?.state);
    if(vals.some(v=>!v))return null;
    const good=vals.filter(v=>v==='bull'||v==='warn').length;
    const missing=vals.filter(v=>v==='na').length;
    return `${good}${missing?'–'+(good+missing):''}/${keys.length}`;
  }
  function columns(market='spy'){
    const cols=[['Session',r=>r.session],['Close',r=>r.detail.close],['Day $',r=>isNum(r.detail.close)&&isNum(r.detail.previous_close)?Number((r.detail.close-r.detail.previous_close).toFixed(4)):null],['Day %',r=>r.detail.price_change_pct],['Health',r=>`${r.detail.score}${r.detail.score_max!==r.detail.score?'–'+r.detail.score_max:''}/${r.detail.total}`],['Regime',r=>r.detail.regime],['Prior regime',r=>r.detail.previous_regime],['Transition',r=>r.detail.risk_transition==='changed'?`${r.detail.previous_regime} → ${r.detail.regime}`:r.detail.risk_transition],['1D score Δ',r=>r.detail.score_delta_1d],['5D score Δ low',r=>r.detail.five_day_delta_range?.[0]],['5D score Δ high',r=>r.detail.five_day_delta_range?.[1]],['5D trend',r=>r.detail.trend_5d],['Coverage',r=>`${r.detail.available}/${r.detail.total}`],['Previous session',r=>r.previous_session],['Previous close',r=>r.detail.previous_close],['Previous health',r=>r.detail.previous_score],['Confirmations improving',r=>r.detail.confirmation?.confirmed],['Confirmations available',r=>r.detail.confirmation?.available],['Confirmation total',r=>r.detail.confirmation?.total],['Swing',r=>r.detail.swing],['Price/risk alert',r=>r.detail.price_risk_label],['SPY vs QQQ',r=>r.marketDivergence],['Estimated count',r=>r.detail.estimated_count],['Estimated signals',r=>(r.detail.estimated_signals||[]).join('; ')],['Shared macro health',r=>groupHealth(r,sharedKeys,r.detail.baseline_context?.shared_macro_bearish)],['Index-specific health',r=>groupHealth(r,marketKeys[r.symbol].slice(0,r.detail.total-6),r.detail.baseline_context?.index_specific_bearish)],['RSI 14',r=>r.detail.metrics?.moving_averages?.rsi?.value??r.detail.baseline_context?.rsi14],['MACD',r=>r.detail.macd_info?.macd],['MACD signal',r=>r.detail.macd_info?.signal],['MACD histogram',r=>r.detail.macd_info?.histogram],['MACD relation',r=>r.detail.macd_info?.relation],['MACD crossover',r=>r.detail.macd_info?.crossover]];
    for(const n of [5,20,50,100,200]){
      cols.push([`${n}D SMA`,r=>r.detail.metrics?.moving_averages?.averages?.[n]?.value??r.detail.baseline_context?.sma?.[n+'D']]);
      cols.push([`${n}D distance %`,r=>r.detail.metrics?.moving_averages?.averages?.[n]?.distance_pct]);
      cols.push([`${n}D state`,r=>r.detail.metrics?.moving_averages?.averages?.[n]?.state]);
    }
    for(const key of [...sharedKeys,...marketKeys[market]]){
      cols.push([names[key]+' state',r=>signal(r,key).label??signal(r,key).state]);
      cols.push([names[key]+' value',r=>signal(r,key).value]);
      cols.push([names[key]+' source',r=>signal(r,key).source]);
    }
    for(const key of ['volatility','credit','breadth','price'])cols.push([`Confirmation: ${key}`,r=>r.detail.metrics?.confirmation_components?.[key]]);
    for(const [group,title] of [['shared','Shared macro'],[market==='spy'?'sp':'nd',market.toUpperCase()]])for(const [key,label] of [['eased','gains'],['new_bearish','losses'],['other','other changes']])cols.push([`${title} ${label}`,r=>labels(r.changes?.groups?.[group]?.[key])]);
    cols.push(['Daily summary',r=>r.summary],['Record origin',r=>r.recordSource],['Source note',r=>r.sourceNote],['Warnings',r=>r.detail.metrics?.warnings?.join('; ')],['Provider data dates',r=>Object.entries(r.detail.metrics?.sources||{}).map(([k,v])=>`${k}: ${v.latest_session||'—'}`).join('; ')],['Fear & Greed',r=>r.sentiment?.as_of===r.session?r.sentiment.value:null],['Fear & Greed classification',r=>r.sentiment?.as_of===r.session?r.sentiment.classification:null],['Sentiment source',r=>r.sentiment?.as_of===r.session?r.sentiment.provider_label:null],['Recorded model',r=>`${r.detail.total}-point`],['Archived bearish points',r=>r.detail.archived_bearish]);
    return cols;
  }
  function toCSV(rows){
    const symbols=[...new Set(rows.map(r=>r.symbol))];
    const cols=symbols.length>1?[['ETF',r=>r.symbol.toUpperCase()],...columns('spy'),...columns('qqq').filter(c=>!columns('spy').some(x=>x[0]===c[0]))]:columns(rows[0]?.symbol||'spy');
    return '\uFEFF'+[cols.map(c=>c[0]),...rows.map(r=>cols.map(c=>c[1](r)))].map(items=>items.map(csvField).join(',')).join('\r\n')+'\r\n';
  }

  function chartRows(entries,opts){
    const filtered=filterRows(entries,opts),days=new Map();
    for(const row of filtered){
      if(!days.has(row.session))days.set(row.session,{date:row.session,previous_session:row.previous_session});
      days.get(row.session)[row.symbol]=row.detail;
    }
    return [...days.values()].reverse();
  }

  // The remaining code runs only in the browser.
  if(typeof document==='undefined')return {validArchive,filterRows,toCSV,chartRows,signed,dateLabel,columns};
  const $=id=>document.getElementById(id);
  let entries=[],lastSession=null;
  const options={range:'all',market:'spy',alertsOnly:false};
  const make=(tag,cls,parent)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(parent)parent.appendChild(e);return e;};
  const small=(tag,value,cls,parent)=>{const e=make(tag,cls,parent);e.textContent=text(value);return e;};
  const pill=(v,cls,parent)=>small('span',v,'journal-pill '+cls,parent);

  function listChanges(parent,title,items,className){
    const c=make('div','',parent);
    small('h4',title+' ('+(items?.length||0)+')','',c);
    if(!items?.length){small('p','No changed signals','',c);return;}
    const ul=make('ul','',c);
    for(const item of items){
      small('li',`${item.label||'Unknown'}: ${item.before||'—'} → ${item.after||'—'}`,className,ul);
    }
  }
  function detailRow(row){
    const tr=make('tr','journal-expanded-row');tr.hidden=true;
    const td=make('td','',tr);td.colSpan=8;
    const cards=make('div','journal-detail-grid',td);
    const d=row.detail;
    const card1=make('div','journal-detail',cards);
    small('h4',row.baseline?'Screenshot baseline · Nov 20, 2026':'Recorded market context','',card1);
    if(row.baseline)small('p',row.sourceNote,'journal-baseline-note',card1);
    if(d.baseline_context){
      const x=d.baseline_context;
      small('p',`Captured ${x.volatility_index?.name||'Volatility'}: ${text(x.volatility_index?.value)} · RSI(14): ${text(x.rsi14)} · Index-specific health points: ${isNum(x.index_specific_bearish)?9-x.index_specific_bearish:'—'}/9 · Shared macro health points: ${isNum(x.shared_macro_bearish)?6-x.shared_macro_bearish:'—'}/6.`,'',card1);
      const b=x.breadth_1d;
      if(b)small('p',`Breadth 1D: ${text(b.state)} (${text(b.value)} ${text(b.units)}).`,'',card1);
    }
    small('p',`${row.symbol.toUpperCase()} ${money(d.previous_close)} → ${money(d.close)} (${signed(d.price_change_pct,'%')})`,'',card1);
    small('p',`Market Health: ${text(d.previous_score)} → ${text(d.score)}${d.score_max!==d.score?'–'+d.score_max:''}/${text(d.total)}. 5D trend: ${text(d.trend_5d)}.`,'',card1);
    small('p',`Risk: ${text(d.previous_regime)} → ${text(d.regime)}. Swing: ${text(d.swing)}.`,'',card1);
    if(d.macd_info){const m=d.macd_info;small('p',`Daily MACD (12,26,9) · ${d.total>=16?'SCORED':'CONTEXT ONLY'}: line ${text(m.macd)} · signal ${text(m.signal)} · histogram ${text(m.histogram)} · ${text(m.relation)}${m.crossover&&m.crossover!=='none'?' · '+text(m.crossover)+' crossover':''}.`,'',card1);}
    const conf=d.confirmation||{};
    small('p',`Market confirmation: ${text(conf.confirmed)}/${text(conf.total)} improving · ${text(conf.available)}/${text(conf.total)} checked.`,'',card1);
    const card2=make('div','journal-detail',cards);
    small('h4','Data quality & alert','',card2);
    small('p',`${text(d.available)} / ${text(d.total)} scored inputs available; ${text(d.estimated_count)} marked estimated.`,'',card2);
    if(d.estimated_signals?.length)small('p',`Estimated inputs: ${d.estimated_signals.join(', ')}`,'',card2);
    small('p',`${text(d.price_risk_label)} · ${text(row.marketDivergence).replaceAll('_',' ')}`,'',card2);
    const cs=row.changes;
    const groups=cs?.status==='complete'?cs.groups||{}:{};
    const combined=groups.shared||{},index=groups[row.symbol==='spy'?'sp':'nd']||{};
    const card3=make('div','journal-detail',cards);
    if(cs?.status==='complete'||cs?.status==='partial'){
      if(cs.status==='partial')small('p','Partial transcription: '+text(cs.note||'Some changes were not visible.'),'journal-muted',card3);
      listChanges(card3,'Shared macro · health lost',combined.new_bearish,'negative');
      listChanges(card3,'Shared macro · health gained',combined.eased,'positive');
    }else{
      small('h4','Shared macro changes','',card3);
      small('p','Unavailable for these matched sessions','',card3);
    }
    const card4=make('div','journal-detail',cards);
    if(cs?.status==='complete'||cs?.status==='partial'){
      listChanges(card4,`${row.symbol.toUpperCase()} · health lost`,index.new_bearish,'negative');
      listChanges(card4,`${row.symbol.toUpperCase()} · health gained`,index.eased,'positive');
      const others=[...(combined.other||[]),...(index.other||[])];
      if(others.length)listChanges(card4,'Other state changes',others,'');
    }else{
      small('h4','Index-specific changes','',card4);
      small('p','Unavailable for these matched sessions','',card4);
    }
    return tr;
  }
  function renderTable(rows){
    const target=$('j-rows');target.replaceChildren();
    const all=columns(options.market),view=$('j-columns')?.value||'all';
    const shared=sharedKeys.map(k=>names[k]),index=marketKeys[options.market].map(k=>names[k]);
    const group=label=>{if(label==='Session')return true;if(view==='all')return true;if(view==='technical')return /^(RSI 14|MACD|[0-9]+D (SMA|distance|state))/.test(label);if(view==='shared')return shared.some(k=>label.startsWith(k+' '))||label.startsWith('Shared macro');if(view==='internals')return index.some(k=>label.startsWith(k+' '))||label.startsWith(options.market.toUpperCase()+' ')||label==='Index-specific health';if(view==='quality')return /source|warnings|coverage|estimated|provider|record|model|sentiment/i.test(label);return all.indexOf(all.find(c=>c[0]===label))<26||/daily summary|fear & greed/i.test(label);};
    const cols=all.filter(c=>group(c[0])),head=$('j-rows').closest('table').querySelector('thead tr');head.replaceChildren();
    for(const [label] of cols){const th=small('th',label,'',head);th.scope='col';}
    $('j-matches').textContent=`${rows.length} ${options.market.toUpperCase()} sessions shown`;
    $('j-export').disabled=!rows.length;
    if(!rows.length){const tr=make('tr','',target);const td=small('td','No saved observations match these filters.','journal-empty',tr);td.colSpan=cols.length;return;}
    const frag=document.createDocumentFragment();
    for(const row of rows){
      const tr=make('tr','',frag);
      for(const [i,[label,get]] of cols.entries()){
        const value=get(row),td=make('td',i===0?'journal-date':'',tr);
        const str=value==null||value===''?'—':typeof value==='boolean'?(value?'Yes':'No'):String(value);
        if(i===0){small('strong',dateLabel(row.session),'',td);if(row.baseline)small('span','BASELINE','journal-baseline-flag',td);}
        else if(label==='Regime'||label==='Prior regime')pill(str,str.toLowerCase(),td);
        else if(/BULLISH|CONTANGO|EXPANDING/i.test(str)&&/state$/.test(label))small('span',str,'journal-up',td);
        else if(/BEARISH|BACKWARDATION|CONTRACTING/i.test(str)&&/state$/.test(label))small('span',str,'journal-down',td);
        else if(/CAUTION|NEUTRAL/i.test(str)&&/state$/.test(label))small('span',str,'journal-caution',td);
        else if(isNum(value)&&['Close','Previous close','Day $'].includes(label))td.textContent=(value<0?'−':label==='Day $'&&value>0?'+':'')+'$'+Math.abs(value).toFixed(2);
        else if(isNum(value)&&(label==='Day %'||label.endsWith('distance %')||label==='1D score Δ'))small('span',(value>0?'+':'')+value.toFixed(label==='1D score Δ'?0:2)+(label==='1D score Δ'?'':'%'),value>0?'journal-up':value<0?'journal-down':'journal-neutral',td);
        else if(str.length>65){
          const btn=small('button',str,'journal-long-value',td);btn.type='button';btn.title=str;btn.setAttribute('aria-expanded','false');
          btn.addEventListener('click',()=>{const open=btn.classList.toggle('expanded');btn.setAttribute('aria-expanded',String(open));});
        }else td.textContent=str;
      }
    }
    target.appendChild(frag);
  }
  function chart(entriesForChart){
    const svg=$('j-score-chart');svg.replaceChildren();
    const W=900,H=230,L=44,R=22,T=16,B=46;
    const el=(tag,attrs={},parent=svg)=>{
      const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
      for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);
      parent.appendChild(node);return node;
    };
    const x=i=>L+(entriesForChart.length<2?0:i/(entriesForChart.length-1))*(W-L-R);
    const y=v=>T+(16-v)/16*(H-T-B);
    for(const [low,high,color] of [[0,5.5,'#d45b65'],[5.5,10.5,'#d4ae58'],[10.5,16,'#32bf8b']]){
      el('rect',{x:L,y:y(high),width:W-L-R,height:y(low)-y(high),fill:color,'fill-opacity':0.075});
    }
    for(const n of [0,5,11,16]){
      el('line',{x1:L,x2:W-R,y1:y(n),y2:y(n),stroke:'#30435a','stroke-width':1});
      const t=el('text',{x:8,y:y(n)+4,fill:'#93abc5','font-size':12});t.textContent=String(n);
    }
    for(const [n,color] of [[5.5,'#8f4856'],[10.5,'#887348']]){
      el('line',{x1:L,x2:W-R,y1:y(n),y2:y(n),stroke:color,'stroke-width':1,'stroke-dasharray':'6 5'});
    }
    if(!entriesForChart.length){
      const t=el('text',{x:W/2,y:113,'text-anchor':'middle',fill:'#9aadc4','font-size':17});t.textContent='Saved daily scores will appear after the next eligible EOD refresh';return;
    }
    const marks=entriesForChart.map((_,i)=>i).filter(i=>i===0||i===entriesForChart.length-1||i%Math.ceil(entriesForChart.length/6)===0);
    for(const i of marks){
      const t=el('text',{x:x(i),y:H-14,'text-anchor':i===0?'start':i===entriesForChart.length-1?'end':'middle',fill:'#92a9c1','font-size':12});
      t.textContent=dateLabel(entriesForChart[i].date).replace(/, \d{4}$/,'');
    }
    for(const [market,color]of [[options.market,options.market==='spy'?'#34e2a4':'#85bfff']]){
      let path='',started=false;
      entriesForChart.forEach((rec,i)=>{
        const d=rec[market],v=d?.score;
        if(!isNum(v)){started=false;return;}
        if(i>0 && rec.previous_session!==entriesForChart[i-1].date)started=false;
        path+=(started?' L':' M')+x(i).toFixed(2)+','+y(v).toFixed(2);started=true;
      });
      if(path)el('path',{d:path,fill:'none',stroke:color,'stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round'});
      entriesForChart.forEach((rec,i)=>{
        const d=rec[market];if(!isNum(d?.score))return;
        const c=el('circle',{cx:x(i),cy:y(d.score),r:entriesForChart.length===1?5:3.5,
          fill:d.available===d.total&&d.total===16?color:'#101b2b',stroke:color,'stroke-width':1.5});
        const t=el('title',{},c);t.textContent=`${rec.date} · ${market.toUpperCase()} ${d.score}${d.score_max!==d.score?'–'+d.score_max:''}/${d.total} Market Health · ${d.regime}`;
      });
    }
  }
  function rerender(){
    const market=options.market,display=market.toUpperCase();
    $('j-market-panel').setAttribute('aria-labelledby','summary-tab-'+market);
    $('j-score-title').textContent=`${display} Market Health history`;
    $('j-log-title').textContent=`${display} historical market log`;
    $('j-chart-legend-label').textContent=display;
    $('j-chart-legend').querySelector('i').className='j-key-dot '+market;
    $('j-score-chart').setAttribute('aria-label',`${display} saved Market Health scores over completed daily sessions`);
    $('j-count').textContent=entries.length.toLocaleString();
    $('j-alerts').textContent=entries.filter(day=>healthView(day[market],day.baseline===true).price_risk_status==='divergence').length.toLocaleString();
    $('j-alerts-note').textContent=`${display} sessions with a price/risk mismatch`;
    const rows=filterRows(entries,options);
    renderTable(rows);
    chart(chartRows(entries,{...options,alertsOnly:false}));
    $('j-message').textContent=entries.length?
      `Showing saved ${options.market.toUpperCase()} EOD observations. November 20 is a labeled screenshot baseline. CSV exports all columns for the selected date range and alert filter.`:
      'No journal entries yet. New completed EOD sessions will appear automatically. Prior bearish scores are inverted only for display; 15-point and 16-point snapshots retain their own denominators; original archived counts remain preserved.';
  }
  function setStatus(msg,ok){$('history-updated').textContent=msg;$('history-dot').className='status-dot '+(ok?'good':'warn');}
  async function load(){
    try{
      const response=await fetch('data/latest.json?history_refresh='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const latest=await response.json();
      const summaries=new Map((window.DailySummaries?.savedSummaries?.(latest)||[]).map(x=>[x.session,x.summary]));
      entries=validArchive(latest).map(row=>{
        const summary=summaries.get(row.session);
        const copy={...row,summary};
        if(row.session===latest.session && latest.price_moves?.session===row.session){
          for(const sym of ALL_MARKETS){
            const d=row[sym],m=latest.markets?.[sym==='spy'?'sp500':'nasdaq100'],ma=latest.moving_averages?.[sym];
            if(!d.metrics && m?.score?.bearish===d.score && m.score.available===d.available && m.score.total===d.total && ma?.as_of===row.session && Math.abs(ma.close-d.close)<.015){
              copy[sym]={...d,metrics:{signals:latest.signals,moving_averages:ma,confirmation_components:m.confirmation?.components,warnings:latest.warnings,sources:latest.sources}};
            }
          }
        }
        return copy;
      });lastSession=latest.session;
      $('j-count').textContent=entries.length.toLocaleString();
      $('j-date-range').textContent=entries.length?`${dateLabel(entries[0].session)} – ${dateLabel(entries.at(-1).session)}`:'Tracking begins at installation';
      $('j-last').textContent=entries.length?dateLabel(entries.at(-1).session):'—';
      $('j-last-note').textContent=entries.length?`${entries.at(-1).previous_session} → ${entries.at(-1).session}`:'Waiting for the first eligible completed-EOD run';
      const when=latest.generated_at?new Date(latest.generated_at).toLocaleString():'not timestamped';
      setStatus(`Updated ${when} · Latest scored: ${lastSession||'—'}`,true);
      rerender();
    }catch(err){
      setStatus('History unavailable',false);
      $('j-message').textContent='Unable to load the published snapshot: '+err.message;
    }
  }
  $('refresh').addEventListener('click',load);
  $('j-range').addEventListener('click',event=>{
    const button=event.target.closest('button[data-range]');if(!button)return;
    options.range=button.dataset.range;
    for(const b of $('j-range').querySelectorAll('button'))b.classList.toggle('selected',b===button);
    rerender();
  });
  function selectMarket(market,moveFocus=false){
    if(!ALL_MARKETS.includes(market))return;
    options.market=market;
    // Direct History tabs live in the primary tab bar. The summary view
    // controls their selected states; selecting the ETF controls its data.
    rerender();
    if(moveFocus)document.getElementById('summary-tab-'+market)?.focus();
  }
  $('j-columns')?.addEventListener('change',()=>renderTable(filterRows(entries,options)));
  $('j-alert-only').addEventListener('change',event=>{options.alertsOnly=event.target.checked;rerender();});
  $('j-export').addEventListener('click',()=>{
    const rows=filterRows(entries,options);if(!rows.length)return;
    const csv=toCSV(rows),blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    try{
      const link=document.createElement('a');link.href=url;
      link.download=`${options.market}-history-${entries.at(-1).session}-${options.range}${options.alertsOnly?'-alerts':''}.csv`;
      document.body.appendChild(link);link.click();link.remove();
    }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  });
  load();
  return {validArchive,filterRows,toCSV,chartRows,signed,dateLabel,selectMarket};
});
