"""20-week exploratory forward-return validation of the LIVE 16-point Market Health model.

Uses completed, date-indexed EOD inputs supplied to the existing scoring engine.
No extra downloads, no forecasting/look-ahead in the signal, and no modifications
of the actual trading signals. Reconstructed breadth can have survivorship bias.
"""
from __future__ import annotations
from datetime import timedelta
from statistics import mean, median, stdev
import math
import pandas as pd

REGIMES = ('RISK-OFF','NEUTRAL','RISK-ON')
HORIZONS = (1, 5, 10)

def _safe(x):
    try:
        v=float(x)
        return v if math.isfinite(v) and v>0 else None
    except (TypeError,ValueError):return None

def _pct(x):
    return round(x,3) if x is not None else None

def _stats(observations, horizon):
    vals=[x['return_pct'] for x in observations]
    n=len(vals)
    # Select signals separated by >= horizon sessions. Deterministic greedy
    # selection in chronological order; this is descriptive sensitivity only.
    non=[]; last=-10**9
    for row in observations:
        if row['index']>=last+horizon:
            non.append(row['return_pct']);last=row['index']
    return {
        'n':n,
        'positive_n':sum(v>0 for v in vals),
        'positive_pct':_pct(100*sum(v>0 for v in vals)/n) if n else None,
        'negative_pct':_pct(100*sum(v<0 for v in vals)/n) if n else None,
        'mean_pct':_pct(mean(vals)) if n else None,
        'median_pct':_pct(median(vals)) if n else None,
        'p10_pct':_pct(sorted(vals)[max(0,math.ceil(.1*n)-1)]) if n else None,
        'worst_pct':_pct(min(vals)) if n else None,
        'stdev_pct':_pct(stdev(vals)) if n>1 else None,
        'nonoverlap_n':len(non),
        'nonoverlap_positive_pct':_pct(100*sum(v>0 for v in non)/len(non)) if non else None,
        'nonoverlap_median_pct':_pct(median(non)) if non else None,
    }

def evaluate(records, prices, end_date=None, weeks=20):
    """Process 16-point reconstructed daily score records and EOD close frame.

    Assumes records as produced by engine.analyze: r['sp']/r['nd'] scored
    from inputs available at r['date']; the latest 10 trading dates cannot
    have mature forward-10 outcomes and are not assigned made-up returns.
    """
    if weeks<1:raise ValueError('weeks must be positive')
    frame=prices.sort_index().copy()
    frame.index=pd.DatetimeIndex(frame.index).tz_localize(None).normalize()
    end=pd.Timestamp(end_date or frame.index.max()).normalize()
    start=end-timedelta(days=7*weeks)
    items=[r for r in records if start<=pd.Timestamp(r['date'])<=end]
    mapping={pd.Timestamp(d):i for i,d in enumerate(frame.index)}
    result={'version':1,'model':'16-point-health-v2-macd-neutral-6-10',
            'start':start.strftime('%Y-%m-%d'),'end':end.strftime('%Y-%m-%d'),
            'weeks':weeks,'method':'reconstructed_historical_EOD_not_point_in_time_saved_signals',
            'outcome':'positive ETF close-to-close return after 1/5/10 trading sessions',
            'thresholds':{'risk_off':[0,5],'neutral':[6,10],'risk_on':[11,16]},
            'markets':{}}
    for key,symbol in [('sp','SPY'),('nd','QQQ')]:
        available=0;incomplete=0;eligible=[]
        for r in items:
            s=r[key];health=s.get('health');total=s.get('total')
            complete=s.get('complete') and s.get('available')==16 and total==16
            if not complete or not isinstance(health,(int,float)) or health<0 or health>16:
                incomplete+=1;continue
            idx=mapping.get(pd.Timestamp(r['date']))
            if idx is None:continue
            close=_safe(frame[symbol].iloc[idx]) if symbol in frame else None
            if close is None:continue
            available+=1
            regime='RISK-OFF' if health<=5 else 'NEUTRAL' if health<=10 else 'RISK-ON'
            eligible.append({'index':idx,'date':r['date'],'health':int(health),'regime':regime,'close':close})
        regimes={name:{'signal_sessions':sum(row['regime']==name for row in eligible),'horizons':{}} for name in REGIMES}
        baseline={}
        for h in HORIZONS:
            groups={name:[] for name in REGIMES};all_obs=[]
            for row in eligible:
                idx=row['index']
                if idx+h>=len(frame) or frame.index[idx+h]>end:continue
                vals=[_safe(v) for v in frame[symbol].iloc[idx+1:idx+h+1]]
                if len(vals)!=h or any(v is None for v in vals):continue
                rr={**row,'return_pct':(vals[-1]/row['close']-1)*100}
                groups[row['regime']].append(rr);all_obs.append(rr)
            for name in REGIMES:regimes[name]['horizons'][str(h)]=_stats(groups[name],h)
            baseline[str(h)]=_stats(all_obs,h)
        result['markets'][key]={'symbol':symbol,'eligible_signal_sessions':available,
                                'incomplete_or_missing_sessions':incomplete,
                                'regimes':regimes,'all_eligible':{'horizons':baseline}}
    result['limitations']=[
        'Reconstructed historical signals, NOT saved historical live observations. Current constituents can introduce survivorship bias.',
        'No dividends, trading costs or slippage. Five- and ten-session return windows overlap; nonoverlap statistics are sensitivity checks.',
        'Classification thresholds were chosen before this test but after earlier model research; this is not out-of-sample proof.',
        'Short 20-week window. No statistical significance or predictive-performance claim is made.',
        'The latest sessions lack mature forward outcomes and are excluded from those horizons.',
        'Exclude any incomplete 16-point scores instead of inferring their regime.'
    ]
    return result
