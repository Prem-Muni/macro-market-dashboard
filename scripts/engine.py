"""Transparent, daily-bar approximation of MacroDecisionDashboard_SP500_Nasdaq100_Combined_SP500TitleFixed.

No values are fabricated: absent/stale provider data produces N/A.
Differences from thinkScript (OHLC/settlement choices, alternative public feeds) are documented.
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
import math
from statistics import median, stdev
import pandas as pd

S = {"bull":"BULLISH", "bear":"BEARISH", "warn":"CAUTION", "na":"N/A"}
SHARED = ["oil", "usd", "tnx", "credit", "copper", "vix_curve"]
SP = ["vix", "sp_def", "sp_xle", "sp_smh", "spy_trend", "sp_rsi14", "rsp_spy", "iwm_spy", "sp_breadth1d"]
ND = ["vxn", "nd_def", "nd_xle", "nd_smh", "qqq_trend", "nd_rsi14", "qqqe_qqq", "iwm_qqq", "nd_breadth1d"]
LABELS = {
 "vix":"VIX", "vxn":"VXN", "oil":"Crude Oil", "usd":"US Dollar", "tnx":"10Y Yield", "credit":"Credit HYG/IEF", "copper":"Copper", "vix_curve":"VIX Curve",
 "sp_rsi14":"SPY RSI (14)", "nd_rsi14":"QQQ RSI (14)",
 "sp_def":"Defensives/SPY", "sp_xle":"XLE/SPY", "sp_smh":"SMH/SPY", "spy_trend":"SPY Trend", "rsp_spy":"RSP/SPY", "iwm_spy":"IWM/SPY", "sp_breadth1d":"S&P Breadth 1D", "sp_breadth5d":"S&P Breadth 5D", "sp_breadth200":"S&P Breadth 200D",
 "nd_def":"Defensives/QQQ", "nd_xle":"XLE/QQQ", "nd_smh":"SMH/QQQ", "qqq_trend":"QQQ Trend", "qqqe_qqq":"QQQE/QQQ", "iwm_qqq":"IWM/QQQ", "nd_breadth1d":"Nasdaq Breadth 1D", "nd_breadth5d":"Nasdaq Breadth 5D",
}
DEPENDENCIES = {
 "sp_breadth1d":"Thinkorswim $SPXA200R history requires an independent constituent breadth feed",
 "sp_breadth5d":"Thinkorswim $SPXA200R history requires an independent constituent breadth feed",
 "sp_breadth200":"Thinkorswim $SPXA200R history requires an independent constituent breadth feed",
 "nd_breadth1d":"Nasdaq-100 advancing/declining counts require an independent constituent feed",
 "nd_breadth5d":"Nasdaq-100 advancing/declining counts require an independent constituent feed",
}
@dataclass
class Signal:
    state: str
    label: str
    value: float | None = None
    note: str = ""
    source: str = ""

    def json(self):
        v = None if self.value is None or not math.isfinite(float(self.value)) else round(float(self.value), 3)
        return {"state": self.state, "label": self.label, "value": v, "note": self.note, "source": self.source}


def safe(n):
    try:
        f=float(n)
        return f if math.isfinite(f) else None
    except (TypeError,ValueError): return None


def signal(kind="na", label=None, value=None, note="", source=""):
    return Signal(kind, label or S[kind], value, note, source)


def wilder_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Wilder RSI with SMA-seeded smoothed gains/losses over `period` changes.

    Returns NaN until period price changes exist. Any missing close resets
    initialization, preventing a discontinuity from being treated as a daily move.
    Flat prices conventionally return neutral RSI=50, not a division-by-zero.
    """
    if period < 1:
        raise ValueError("RSI period must be positive")
    values=pd.to_numeric(close,errors="coerce")
    result=pd.Series(float("nan"),index=values.index,dtype=float)
    average_gain=average_loss=None
    start_gains=[]; start_losses=[]
    for i in range(1,len(values)):
        now=safe(values.iloc[i]); before=safe(values.iloc[i-1])
        if now is None or before is None:
            average_gain=average_loss=None
            start_gains.clear(); start_losses.clear()
            continue
        change=now-before
        gain=max(change,0.0); loss=max(-change,0.0)
        if average_gain is None:
            start_gains.append(gain); start_losses.append(loss)
            if len(start_gains)<period:
                continue
            average_gain=sum(start_gains)/period
            average_loss=sum(start_losses)/period
        else:
            average_gain=(average_gain*(period-1)+gain)/period
            average_loss=(average_loss*(period-1)+loss)/period
        if average_gain==0 and average_loss==0:
            result.iloc[i]=50.0
        elif average_loss==0:
            result.iloc[i]=100.0
        else:
            rs=average_gain/average_loss
            result.iloc[i]=100.0-100.0/(1.0+rs)
    return result


def build_frames(prices: pd.DataFrame, extra: pd.DataFrame | None = None):
    """DataFrames must be session-date indexed. All values end-of-day."""
    f = prices.copy().sort_index().astype(float)
    f.index = pd.DatetimeIndex(f.index).tz_localize(None).normalize()
    if extra is not None and not extra.empty:
        e=extra.copy().sort_index()
        e.index=pd.DatetimeIndex(e.index).tz_localize(None).normalize()
        for col in e:
            f[col]=pd.to_numeric(e[col],errors="coerce").reindex(f.index)
    def c(name): return f[name] if name in f else pd.Series(float("nan"),index=f.index,dtype=float)
    def delta(name): return c(name).diff()
    def pct(name, lag): return c(name).div(c(name).shift(lag)).sub(1)
    def ma(x,days): return x.rolling(days,min_periods=days).mean()
    # Price and cross-asset series
    spy,qqq,smh,iwm,rsp,qqqe = [c(k) for k in ("SPY","QQQ","SMH","IWM","RSP","QQQE")]
    oil, usd, tnx, copper = [c(k) for k in ("OIL","USD","TNX","COPPER")]
    vix,vxn,vix3m = [c(k) for k in ("VIX","VXN","VIX3M")]
    hyg,ief,xlp,xlv,xlu,xle = [c(k) for k in ("HYG","IEF","XLP","XLV","XLU","XLE")]
    basket1 = (pct("XLP",1)+pct("XLV",1)+pct("XLU",1))/3
    basket10 = (pct("XLP",10)+pct("XLV",10)+pct("XLU",10))/3
    f["spy_day"] = pct("SPY",1)
    f["oil_chg"],f["usd_chg"],f["tnx_chg"],f["cu_chg"] = oil.diff(),usd.diff(),tnx.diff(),copper.diff()
    f["hyg_r"],f["ief_r"] = pct("HYG",1),pct("IEF",1)
    f["basket_1"],f["basket_10"] = basket1,basket10
    f["spy_1"],f["spy_10"],f["qqq_1"],f["qqq_10"],f["xle_10"] = pct("SPY",1),pct("SPY",10),pct("QQQ",1),pct("QQQ",10),pct("XLE",10)
    # Daily simple moving averages and Wilder RSI. All five SMA rows are
    # informational; the original 50D/200D trend signal is scored once,
    # plus one RSI point. Individual MA rows do not score separately.
    for symbol, close_series in (("spy", spy), ("qqq", qqq)):
        for days in (5, 20, 50, 100, 200):
            f[f"{symbol}_ma{days}"] = ma(close_series, days)
        f[f"{symbol}_rsi14"] = wilder_rsi(close_series, 14)
    f["smh_ema20"],f["spy_ema20"],f["qqq_ema20"] = smh.ewm(span=20,adjust=False,min_periods=20).mean(), spy.ewm(span=20,adjust=False,min_periods=20).mean(), qqq.ewm(span=20,adjust=False,min_periods=20).mean()
    f["smh_sp_ma15"],f["smh_nd_ma15"] = ma(smh/spy,15),ma(smh/qqq,15)
    for name,ratio in (("rsp_spy",rsp/spy),("iwm_spy",iwm/spy),("qqqe_qqq",qqqe/qqq),("iwm_qqq",iwm/qqq)):
        f[f"{name}_rel"] = ratio
        f[f"{name}_diff"] = (ratio/ma(ratio,10)-1)*100
    f["vix_curve_ratio"] = vix/vix3m
    f["credit_ratio"] = hyg/ief
    # SPX_BREADTH200 is 0..100 percentage, and is NOT assumed to be available.
    f["breadth_1d"] = c("SPX_BREADTH200").diff()
    f["breadth_5d"] = c("SPX_BREADTH200").diff(5)
    ndtotal=c("NDX_ADV")+c("NDX_DECL")
    f["nd_adv_share"] = c("NDX_ADV").div(ndtotal.where(ndtotal>0))*100
    f["nd_5d_delta"] = ma(f["nd_adv_share"],5)-ma(f["nd_adv_share"],5).shift(5)
    return f


def build_day(f: pd.DataFrame, pos: int, sources:dict | None=None):
    sources=sources or {}
    row=f.iloc[pos]
    day=f.index[pos].strftime("%Y-%m-%d")
    sigs={}
    def v(key): return safe(row.get(key))
    def src(key): return sources.get(key, "")
    def put(key, state, label=None, value=None, note="", source=""):
        sigs[key]=signal(state,label,value,note,source)
    def condition(key, required, func, source=""):
        vals=[v(k) for k in required]
        if any(x is None for x in vals):
            put(key,"na",note=DEPENDENCIES.get(key,"Market data unavailable or stale"),source=source)
        else:
            state,label,val,note=func(*vals)
            put(key,state,label,val,note,source)
    for key,col,bull,bear in (("vix","VIX",16,20),("vxn","VXN",20,25)):
        def volfunc(x,bull=bull,bear=bear):
            st="bear" if x>bear else "bull" if x<bull else "warn"
            return st,S[st],x,"Spot implied volatility"
        condition(key,[col],volfunc,src(col))
    for key,col in (("oil","oil_chg"),("usd","usd_chg"),("tnx","tnx_chg")):
        def cfunc(chg,sp):
            if chg==0 or sp==0: return "warn","FLAT",None,"No directional change"
            bear=chg>0
            div=(chg>0 and sp>0) or (chg<0 and sp<0)
            st="bear" if bear else "bull"
            return st,("BEARISH" if bear else "BULLISH")+(" DIV" if div else ""),None,"Daily direction vs SPY"
        ticker={"oil":"OIL","usd":"USD","tnx":"TNX"}[key]
        condition(key,[col,"spy_day"],cfunc,src(ticker))
    condition("credit",["hyg_r","ief_r"],lambda h,i:("bear","BEARISH",None,"HYG daily return below IEF") if h<i else ("bull","BULLISH",None,"HYG daily return at least IEF"),"HYG / IEF")
    condition("copper",["cu_chg"],lambda d:("bear" if d<0 else "bull","BEARISH" if d<0 else "BULLISH",None,"Daily copper change"),src("COPPER"))
    def curve(x):
        st="bear" if x>1.0 else "bull" if x<0.90 else "warn"
        label="BACKWARDATION" if x>1.0 else "CONTANGO" if x<0.90 else "FLAT" if x==1 else "SHALLOW CONTANGO"
        return st,label,x,"VIX / VIX3M implied-volatility ratio"
    condition("vix_curve",["vix_curve_ratio"],curve,src("VIX3M"))
    for key,bench in (("sp_def","spy"),("nd_def","qqq")):
        def defensive(d10,b10,d1,b1):
            if d10>b10: return "bear","BEARISH",None,"Defensives lead on 10D"
            if d1>b1: return "warn","CAUTION",None,"Defensives lead on 1D only"
            return "bull","BULLISH",None,"Benchmark leads"
        condition(key,["basket_10",f"{bench}_10","basket_1",f"{bench}_1"],defensive,"XLP / XLV / XLU")
    for key,bench in (("sp_xle","spy"),("nd_xle","qqq")):
        condition(key,["xle_10",f"{bench}_10"],lambda x,b:("bear","BEARISH",None,"XLE leads 10D") if x>b else ("bull","BULLISH",None,"Benchmark leads 10D"),"XLE")
    for key,bench in (("sp_smh","spy"),("nd_smh","qqq")):
        def semis(s,sem,ind,idx,ratio,ratio_ma):
            if s<sem: return ("bear","BEARISH DIV" if ind>=idx else "BEARISH",None,"SMH below 20D EMA")
            if ratio<ratio_ma: return "warn","LAGGING",None,"SMH relative ratio below 15D average"
            return "bull","BULLISH",None,"SMH trend and ratio favorable"
        condition(key,["SMH","smh_ema20",bench.upper(),f"{bench}_ema20", "smh_sp_ma15" if bench=="spy" else "smh_nd_ma15", "smh_sp_ma15" if bench=="spy" else "smh_nd_ma15"],lambda s,e,b,bma,ma1,ma2: semis(s,e,b,bma, s/b,ma1),"SMH")
    for key,bench in (("spy_trend","spy"),("qqq_trend","qqq")):
        def trend(c,ma50,ma200):
            if c<ma200: return "bear","BEARISH",None,"Below 200D SMA"
            if c>ma50 and ma50>ma200: return "bull","BULLISH",None,"Above 50D SMA; 50D above 200D"
            return "warn","CAUTION",None,"Mixed trend"
        condition(key,[bench.upper(),f"{bench}_ma50",f"{bench}_ma200"],trend,bench.upper())
    # The old SPY Trend / QQQ Trend indicator above remains the scored trend
    # signal. Each 5/20/50/100/200 day MA is displayed separately as context
    # (close >= SMA is BULLISH) and NEVER contributes an extra score point.
    # 45-55 is an intentionally neutral momentum buffer around RSI's 50
    # centreline; these are research thresholds, not 30/70 reversal signals.
    for key,bench in (("sp_rsi14","spy"),("nd_rsi14","qqq")):
        def rsiscore(v):
            st="bear" if v<45 else "bull" if v>55 else "warn"
            return st,S[st],v,"Wilder RSI(14): <45 bearish; 45-55 caution; >55 bullish; overbought is not automatically bearish"
        condition(key,[f"{bench}_rsi14"],rsiscore,bench.upper()+" EOD close")
    for key in ("rsp_spy","iwm_spy","qqqe_qqq","iwm_qqq"):
        def relative(diff):
            st="bull" if diff>0.25 else "bear" if diff < -0.25 else "warn"
            return st,S[st],diff,"Ratio vs 10D SMA; ±0.25% neutral band"
        condition(key,[f"{key}_diff"],relative,key.replace("_","/").upper())
    def spbreadth(change):
        st="bear" if change <= -1 else "bull" if change >= 1 else "warn"
        return st,"CONTRACTING" if st=="bear" else "EXPANDING" if st=="bull" else "STABLE",change,"1D change in % of SPX constituents above 200D SMA; pp"
    condition("sp_breadth1d",["breadth_1d"],spbreadth,src("SPX_BREADTH200"))
    def spbreadth5(change):
        st="bear" if change<=-2 else "bull" if change>=2 else "warn"
        return st,"CONTRACTING" if st=="bear" else "EXPANDING" if st=="bull" else "STABLE",change,"5D change, percentage points"
    condition("sp_breadth5d",["breadth_5d"],spbreadth5,src("SPX_BREADTH200"))
    def spbreadth200(x):
        st="bull" if x>=60 else "bear" if x<40 else "warn"
        return st,S[st],x,"Current % of SPX constituents above own 200D SMA"
    condition("sp_breadth200",["SPX_BREADTH200"],spbreadth200,src("SPX_BREADTH200"))
    def ndbreadth(x):
        st="bear" if x<45 else "bull" if x>55 else "warn"
        return st,"CONTRACTING" if st=="bear" else "EXPANDING" if st=="bull" else "STABLE",x,"Today's advancing share % (not SPX 200D breadth)"
    condition("nd_breadth1d",["nd_adv_share"],ndbreadth,src("NDX_ADV"))
    def ndbreadth5(x):
        st="bear" if x<=-5 else "bull" if x>=5 else "warn"
        return st,"CONTRACTING" if st=="bear" else "EXPANDING" if st=="bull" else "STABLE",x,"Change in average advancing share between adjacent 5D windows; pp"
    condition("nd_breadth5d",["nd_5d_delta"],ndbreadth5,src("NDX_ADV"))
    return day,sigs


def score_of(signals, keys, risk_on_max: int = 4):
    valid=[k for k in keys if signals[k].state!="na"]
    bears=sum(signals[k].state in ("bear","wash") for k in valid)
    missing=len(keys)-len(valid)
    # Health counts all available non-bearish signals, including neutral states.
    # The bearish count remains in the JSON for legacy history compatibility.
    # Score interval: unknown inputs can be bearish or non-bearish.
    total=len(keys)
    health_low=total-bears-missing
    health_high=total-bears
    def regime(health): return "RISK-OFF" if health<=5 else "NEUTRAL" if health<=10 else "RISK-ON"
    low,high=regime(health_low),regime(health_high)
    return {"bearish":bears,"possible_max":bears+missing,"health":health_low,"health_max":health_high,"total":total,"available":len(valid),"missing":missing,"regime":low if low==high else "INCOMPLETE","complete":missing==0,"available_keys":valid}


def score_of_legacy14(signals, keys):
    # Preserve original 14-point risk labels for an apples-to-apples audit.
    value=score_of(signals,keys)
    def old_regime(n): return "RISK-ON" if n<=4 else "CAUTION" if n<=7 else "RISK-OFF"
    low=old_regime(value["bearish"])
    high=old_regime(value["possible_max"])
    value["regime"]=low if low==high else "INCOMPLETE"
    return value


def score_momentum_bounds(today: dict, previous: dict | None, threshold=2):
    """Conservative trend classification across EVERY missing-signal outcome.

    A missing indicator can be either 0 or 1 at either date. A point estimate is
    retained for display/backward compatibility but never used to assert a regime.
    """
    if previous is None:
        return {"observed":None,"min":None,"max":None,"state":"N/A"}
    observed=today["bearish"]-previous["bearish"]
    lo=today["bearish"]-previous["possible_max"]
    hi=today["possible_max"]-previous["bearish"]
    def classify(n):
        return "IMPROVING" if n<=-threshold else "DETERIORATING" if n>=threshold else "STABLE"
    labels={classify(n) for n in range(lo,hi+1)}
    return {"observed":observed,"min":lo,"max":hi,
            "state":next(iter(labels)) if len(labels)==1 else "UNCERTAIN"}


def swing_from_bounds(score: dict, prev_score: dict | None, confirmation: dict, trend_state: str):
    """Show a Swing Environment only if all feasible missing-input states agree."""
    if prev_score is None or confirmation['available']==0 or trend_state == 'na':
        return "N/A"
    # Confirmation unknowns can be true or false; never treat unavailable as 0.
    confirmed=confirmation['confirmed']
    unknown=confirmation['total']-confirmation['available']
    def swing_one(points, change, confirms, is_beartrend):
        if points<=4 and change<2 and confirms>=3 and not is_beartrend:
            return "BULLISH"
        if points>=9 and change<=-2 and confirms>=2:
            return "EARLY IMPROVEMENT"
        if points>=9:
            return "BEARISH"
        if 5<=points<=7 and change>=2:
            return "DETERIORATING"
        return "SELECTIVE"
    outcomes=set()
    # The current index trend is known or missing; missing returns N/A above.
    beartrend = trend_state == 'bear'
    for current in range(score['bearish'],score['possible_max']+1):
        for earlier in range(prev_score['bearish'],prev_score['possible_max']+1):
            for conf in range(confirmed,confirmed+unknown+1):
                outcomes.add(swing_one(current,current-earlier,conf,beartrend))
    return next(iter(outcomes)) if len(outcomes)==1 else "N/A"


def historical_backtest(records: list[dict], frame: pd.DataFrame, end_date: pd.Timestamp, months: int = 20) -> dict:
    """Research-only forward close-to-close returns, no look-ahead score inputs.

    All qualifying sessions have complete 15/15 signals. A valid full five-
    session forward QQQ/SPY closing-price window is required to count an
    outcome. Overlapping windows are retained in primary descriptive statistics
    but a chronological non-overlapping sensitivity sample is also reported.
    Historical constituent breadth is NOT point-in-time and may bias outcomes.
    """
    locs = {pd.Timestamp(d): i for i, d in enumerate(frame.index)}
    rec_by_date = {pd.Timestamp(r['date']): r for r in records}
    ordered_dates = list(frame.index)

    def quantile(values, probability):
        if not values:
            return None
        values = sorted(values)
        position = (len(values) - 1) * probability
        low = int(position)
        high = min(low + 1, len(values) - 1)
        return values[low] + (values[high] - values[low]) * (position - low)

    def stat(items, symbol):
        r5, r1, adverse, paired = [], [], [], []
        for rec in sorted(items, key=lambda r: r['date']):
            loc = locs.get(pd.Timestamp(rec['date']))
            if loc is None:
                continue
            initial = safe(frame[symbol].iloc[loc])
            if initial is None or initial <= 0:
                continue
            if loc + 1 < len(frame):
                p1 = safe(frame[symbol].iloc[loc + 1])
                if p1 is not None and p1 > 0:
                    r1.append((p1 / initial - 1) * 100)
            if loc + 5 >= len(frame):
                continue
            next_closes = [safe(x) for x in frame[symbol].iloc[loc + 1:loc + 6]]
            if any(x is None or x <= 0 for x in next_closes):
                continue
            forward = (next_closes[-1] / initial - 1) * 100
            worst_close = min(0.0, min((x / initial - 1) * 100 for x in next_closes))
            r5.append(forward)
            adverse.append(worst_close)
            paired.append((loc, forward))
        # Every selected five-session return spans [close(t), close(t+5)].
        # Requiring the next signal at least five sessions later avoids
        # overlapping return intervals. This is a sensitivity check, not a
        # real trading strategy, and its sample depends on date ordering.
        nonoverlap = []
        last_loc = -10**8
        for loc, ret in paired:
            if loc >= last_loc + 5:
                nonoverlap.append(ret)
                last_loc = loc
        n = len(r5)
        return {
            'days': len(items),
            'forward1_observations': len(r1),
            'forward1_mean_pct': round(sum(r1) / len(r1), 3) if r1 else None,
            'forward5_observations': n,
            'forward5_mean_pct': round(sum(r5) / n, 3) if n else None,
            'forward5_median_pct': round(median(r5), 3) if n else None,
            'forward5_stddev_pct': round(stdev(r5), 3) if n >= 2 else None,
            'forward5_p10_pct': round(quantile(r5, .10), 3) if n else None,
            'forward5_worst_pct': round(min(r5), 3) if n else None,
            'forward5_positive_pct': round(100 * sum(x > 0 for x in r5) / n, 1) if n else None,
            'forward5_worst_close_mean_pct': round(sum(adverse) / n, 3) if n else None,
            'forward5_worst_close_pct': round(min(adverse), 3) if n else None,
            'forward5_worst_close_median_pct': round(median(adverse), 3) if n else None,
            'forward5_below_minus2_pct': round(100 * sum(x <= -2 for x in adverse) / n, 1) if n else None,
            'nonoverlap_observations': len(nonoverlap),
            'nonoverlap_mean_pct': round(sum(nonoverlap) / len(nonoverlap), 3) if nonoverlap else None,
            'nonoverlap_median_pct': round(median(nonoverlap), 3) if nonoverlap else None,
            'nonoverlap_positive_pct': round(100 * sum(x > 0 for x in nonoverlap) / len(nonoverlap), 1) if nonoverlap else None,
        }

    def classify_score5_trend(rec, market):
        loc = locs.get(pd.Timestamp(rec['date']))
        if loc is None or loc < 5:
            return 'unavailable'
        earlier = rec_by_date.get(pd.Timestamp(ordered_dates[loc - 5]))
        if not earlier or not earlier[market]['complete']:
            return 'unavailable'
        delta = rec[market]['bearish'] - earlier[market]['bearish']
        return 'improving' if delta <= -2 else 'deteriorating' if delta >= 2 else 'stable'

    def qqq_groups(items):
        eligible = [r for r in items if r['nd']['complete']]
        groups = {'zero_to_four': [], 'exactly_five': [], 'five_improving': [],
                  'five_stable': [], 'five_deteriorating': [], 'selective': []}
        for rec in eligible:
            score = rec['nd']['bearish']
            if score <= 4:
                groups['zero_to_four'].append(rec)
                groups['selective'].append(rec)
            elif score == 5:
                groups['exactly_five'].append(rec)
                trend = classify_score5_trend(rec, 'nd')
                if trend != 'unavailable':
                    groups['five_' + trend].append(rec)
                if trend == 'improving':
                    groups['selective'].append(rec)
        return {k: stat(v, 'QQQ') for k, v in groups.items()}

    def one_window(begin: pd.Timestamp, include_splits=False) -> dict:
        sub = [r for r in records if begin <= pd.Timestamp(r['date']) <= end_date]
        answer = {'start': begin.strftime('%Y-%m-%d'),
                  'end': end_date.strftime('%Y-%m-%d'),
                  'sessions': len(sub), 'markets': {}}
        for market, symbol in [('sp', 'SPY'), ('nd', 'QQQ')]:
            complete = [r for r in sub if r[market]['complete']]
            groups = {'zero_to_four': [], 'exactly_five': [], 'zero_to_five': []}
            trend_groups = {'improving': [], 'stable': [], 'deteriorating': [], 'unavailable': []}
            for rec in complete:
                score = rec[market]['bearish']
                if score <= 4:
                    groups['zero_to_four'].append(rec)
                if score == 5:
                    groups['exactly_five'].append(rec)
                    trend_groups[classify_score5_trend(rec, market)].append(rec)
                if score <= 5:
                    groups['zero_to_five'].append(rec)
            answer['markets'][market] = {
                'complete_days': len(complete),
                'incomplete_days': len(sub) - len(complete),
                **{k: stat(items, symbol) for k, items in groups.items()},
                'score_five_trend': {k: stat(items, symbol) for k, items in trend_groups.items()},
                'zero_to_four_plus_five_improving': stat(groups['zero_to_four'] + trend_groups['improving'], symbol),
                'trend_rule': '5-session bearish score delta: <= -2 improving, -1 to +1 stable, >= +2 deteriorating',
            }
        # QQQ-specific risk-adjusted comparison, using complete indicator
        # histories only, with a chronological split for robustness.
        answer['qqq_risk'] = {'groups': qqq_groups(sub)}
        if include_splits:
            midpoint = begin + pd.DateOffset(months=months // 2)
            first = [r for r in sub if pd.Timestamp(r['date']) < midpoint]
            second = [r for r in sub if pd.Timestamp(r['date']) >= midpoint]
            answer['qqq_risk']['halves'] = [
                {'label': 'Earlier 10 months', 'start': begin.strftime('%Y-%m-%d'),
                 'end': (midpoint - pd.Timedelta(days=1)).strftime('%Y-%m-%d'),
                 'sessions': len(first), 'groups': qqq_groups(first)},
                {'label': 'Later 10 months', 'start': midpoint.strftime('%Y-%m-%d'),
                 'end': end_date.strftime('%Y-%m-%d'),
                 'sessions': len(second), 'groups': qqq_groups(second)},
            ]
        return answer

    return {'year': one_window(end_date - pd.Timedelta(days=365)),
            'twenty_months': one_window(end_date - pd.DateOffset(months=months), True)}


def scored_signal_changes(previous: dict, current: dict, from_session: str, to_session: str) -> dict:
    """Compare *two complete session builds*; never infer signal flips from total scores.

    Only scored keys participate. Missing states are skipped (not 'improved').
    States counted as bearish follow score_of() exactly, including wash.
    """
    groups={"shared": SHARED, "sp": SP, "nd": ND}
    output={"from_session": from_session, "to_session": to_session,
            "groups": {}, "by_key": {}}
    for group,keys in groups.items():
        new_bearish, eased, other=[],[],[]
        compared=0; skipped=0
        for key in keys:
            before=previous.get(key); after=current.get(key)
            prev_state=getattr(before,"state",None)
            next_state=getattr(after,"state",None)
            if prev_state not in ("bear","bull","warn","wash") or next_state not in ("bear","bull","warn","wash"):
                skipped+=1
                continue
            compared+=1
            if prev_state == next_state:
                continue
            was_bear=prev_state in ("bear","wash")
            now_bear=next_state in ("bear","wash")
            if now_bear and not was_bear: kind="new_bearish";target=new_bearish
            elif was_bear and not now_bear: kind="eased";target=eased
            else: kind="other";target=other
            row={"key":key,"label":LABELS.get(key,key),"before":getattr(before,"label",prev_state),
                 "after":getattr(after,"label",next_state),"kind":kind}
            target.append(row)
            output["by_key"][key]=kind
        output["groups"][group]={"new_bearish":new_bearish,"eased":eased,"other":other,
                                  "compared":compared,"skipped":skipped,"total":len(keys)}
    return output


def analyze(prices:pd.DataFrame,extra:pd.DataFrame|None=None, sources:dict|None=None, history_days=100, history_months=20):
    f=build_frames(prices,extra)
    if "SPY" not in f or "QQQ" not in f: raise ValueError("SPY and QQQ historical prices required")
    dates=f.index[f["SPY"].notna() & f["QQQ"].notna()]
    if len(dates)<1: raise ValueError("No common SPY and QQQ daily trading session")
    # Avoid displaying a stale previous session as if it were current: UI clearly shows actual session.
    d=dates[-1]
    indexpos=f.index.get_loc(d)
    records=[]
    # More days retained so 5D analytics compare the same available inputs.
    # Keep original 14-point baseline (identical signals minus the new RSI
    # point) for comparison; the 15-point model uses the original trend rule.
    old_sp=["vix", "sp_def", "sp_xle", "sp_smh", "spy_trend", "rsp_spy", "iwm_spy", "sp_breadth1d"]
    old_nd=["vxn", "nd_def", "nd_xle", "nd_smh", "qqq_trend", "qqqe_qqq", "iwm_qqq", "nd_breadth1d"]
    # Reconstruct each historical session from EOD input series. The price
    # loader fetches 3 years for ~200-session warm-up ahead of 20-month window.
    first_date = pd.Timestamp(d) - pd.DateOffset(months=history_months)
    history_start = int(f.index.searchsorted(first_date))
    # Keep eight prior sessions to preserve any last-5D comparisons.
    for pos in range(max(0,history_start-8),indexpos+1):
        day,sigs=build_day(f,pos,sources)
        records.append({"date":day,"signals":sigs,
                        "sp":score_of(sigs,SHARED+SP),"nd":score_of(sigs,SHARED+ND,risk_on_max=5),
                        "sp_legacy":score_of_legacy14(sigs,SHARED+old_sp),
                        "nd_legacy":score_of_legacy14(sigs,SHARED+old_nd)})
    latest=records[-1]
    def momentum(index):
        today=latest[index]
        previous1=records[-2][index] if len(records)>1 else None
        previous5=records[-6][index] if len(records)>5 else None
        a=score_momentum_bounds(today,previous1)
        b=score_momentum_bounds(today,previous5)
        return {"d1":a['observed'],"d5":b['observed'],"state":b['state'],
                "d1_range":[a['min'],a['max']],"d5_range":[b['min'],b['max']],
                "partial":not today['complete'] or (previous5 is not None and not previous5['complete'])}
    latest["sp_momentum"]=momentum("sp")
    latest["nd_momentum"]=momentum("nd")
    # Same 4 category recovery confirmations as the thinkScript. Unavailable remains UNKNOWN.
    frow=f.iloc[indexpos]
    prev=f.iloc[indexpos-5] if indexpos>=5 else None
    def ups(x,y,reverse=False):
        a=safe(frow.get(x)); b=safe(prev.get(y or x)) if prev is not None else None
        if a is None or b is None: return None
        return a < b if reverse else a>b
    volsp=ups("VIX","VIX",True); volnd=ups("VXN","VXN",True)
    cr=ups("credit_ratio","credit_ratio")
    spbr=safe(frow.get("breadth_5d")); ndbr=safe(frow.get("nd_5d_delta"))
    brsp=None if spbr is None else spbr>=2
    brnd=None if ndbr is None else ndbr>=5
    pricesp=ups("SPY","SPY"); pricend=ups("QQQ","QQQ")
    def confirmation(vol,br,price):
        vals={"volatility":vol,"credit":cr,"breadth":br,"price":price}
        available=sum(x is not None for x in vals.values())
        return {"confirmed":sum(x is True for x in vals.values()),"available":available,"total":4,"components":vals}
    latest["sp_confirmation"]=confirmation(volsp,brsp,pricesp)
    latest["nd_confirmation"]=confirmation(volnd,brnd,pricend)
    def swing(index):
        prev_score=records[-6][index] if len(records)>5 else None
        trend_key="spy_trend" if index=="sp" else "qqq_trend"
        return swing_from_bounds(latest[index],prev_score,
            latest[index+"_confirmation"],latest["signals"][trend_key].state)
    latest["sp_swing"]=swing("sp")
    latest["nd_swing"]=swing("nd")
    # All five ETF SMA rows remain informational; original 50D/200D Trend
    # and RSI14 are the two scored technical signals.
    def ma_context(symbol):
        close=safe(frow.get(symbol.upper()))
        averages={}
        for days in (5, 20, 50, 100, 200):
            level=safe(frow.get(f"{symbol}_ma{days}"))
            averages[str(days)]={
                "value": round(level, 3) if level is not None else None,
                "distance_pct": round((close/level-1)*100, 2) if close is not None and level is not None and level>0 else None,
                # Equality is bullish by design; use unrounded prices to avoid
                # a displayed 0.00% gap masking a tiny but real difference.
                "state": ("BULLISH" if close>=level else "BEARISH") if close is not None and level is not None and level>0 else "N/A",
            }
        rsi=safe(frow.get(f"{symbol}_rsi14"))
        rsi_label=("OVERBOUGHT" if rsi>=70 else "OVERSOLD" if rsi<=30 else "NEUTRAL") if rsi is not None else "N/A"
        return {"symbol":symbol.upper(), "as_of":latest["date"],
                "close":round(close, 3) if close is not None else None,
                "averages":averages,
                "rsi": {"period":14, "value":round(rsi,2) if rsi is not None else None,
                        "state":rsi_label}}
    moving_averages={"spy":ma_context("spy"), "qqq":ma_context("qqq")}
    # Compare reconstructed completed EOD signal states, never a partially
    # cached website JSON. This field has no effect on risk scoring or backtests.
    signal_changes = (scored_signal_changes(records[-2]["signals"],latest["signals"],
                     records[-2]["date"],latest["date"]) if len(records)>1 else None)
    latest["signals"]={k:v.json() for k,v in latest["signals"].items()}
    def prune_sc(x): return {k:v for k,v in x.items() if k!="available_keys"}
    latest["sp"]=prune_sc(latest["sp"]); latest["nd"]=prune_sc(latest["nd"])
    legacy_sp=prune_sc(latest["sp_legacy"])
    legacy_nd=prune_sc(latest["nd_legacy"])
    historical_records=[r for r in records if pd.Timestamp(r["date"]) >= first_date]
    history=[{"date":r["date"], "sp":r["sp"]["bearish"],"sp_available":r["sp"]["available"],
              "sp_max":r["sp"]["possible_max"], "nd":r["nd"]["bearish"],"nd_available":r["nd"]["available"],
              "nd_max":r["nd"]["possible_max"]} for r in historical_records]
    backtest=historical_backtest(records,f,pd.Timestamp(d),history_months)  # include 8 warm-up sessions for score-trend classification
    return {"session":latest["date"],"generated_at":datetime.now(timezone.utc).isoformat(),"model_version":"15-point-health-v1-neutral-6-10", "mode":"LIVE AUTOMATED / PARTIAL WHEN FEEDS MISSING", "method":"Daily-bar port of Thinkorswim rules; not a live brokerage feed", "markets":{"sp500":{"score":latest["sp"],"legacy_14":legacy_sp,"momentum":latest["sp_momentum"],"confirmation":latest["sp_confirmation"],"swing":latest["sp_swing"]},"nasdaq100":{"score":latest["nd"],"legacy_14":legacy_nd,"momentum":latest["nd_momentum"],"confirmation":latest["nd_confirmation"],"swing":latest["nd_swing"]}},"signals":latest["signals"],"signal_changes":signal_changes,"moving_averages":moving_averages,"history":history,"backtest":backtest,"history_window_months":history_months,"history_storage":"legacy_bearish_counts_display_as_health",
            "risk_policy":{"score_name":"Market Health", "direction":"higher_is_healthier",
                            "formula":"15 minus bearish signal count; neutral/warning input counts as non-bearish",
                            "sp500":{"risk_off_max":5,"neutral_min":6,"neutral_max":10,"risk_on_min":11},
                            "nasdaq100":{"risk_off_max":5,"neutral_min":6,"neutral_max":10,"risk_on_min":11},
                            "legacy_backtest_policy":"Earlier forward-return research used bearish scores and different thresholds; not validated for this new policy.",
                            "decision_date":"2026-11-25"},"order":{"shared":SHARED,"sp500":SP+["sp_breadth5d","sp_breadth200"],"nasdaq100":ND+["nd_breadth5d"]},"names":LABELS,"explanation":{"missing":"Breadth may be estimated from current constituents and unofficial price history when coverage is adequate; otherwise N/A.","partial":"Health Score is an interval when inputs are missing. Missing points are never automatically counted as healthy.","rights":"Confirm provider display and redistribution permissions before publishing derived data publicly.","model":"Experimental 15-point Market Health model for both indexes: higher is healthier; 0–5 Risk-Off, 6–10 Neutral, 11–15 Risk-On. Health counts non-bearish scored states (bullish or neutral), not purely bullish votes. Raw bearish counts are retained for archival compatibility. Historical 20-month scores are reconstructed from downloaded market data, not previously recorded historical snapshots. Breadth uses current constituent membership and may suffer survivorship bias. Only full 15/15 sessions enter score ≤4/5 backtest counts; future 5-session ETF price returns are descriptive and overlapping. QQQ risk validation adds median, standard deviation, downside-tail and non-overlapping sensitivity statistics plus chronological 10-month halves. RSI(14) adds one point; original 50D/200D trend rule is retained; five SMA readings are informational only."}}
