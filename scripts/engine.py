"""Transparent, daily-bar approximation of MacroDecisionDashboard_SP500_Nasdaq100_Combined_SP500TitleFixed.

No values are fabricated: absent/stale provider data produces N/A.
Differences from thinkScript (OHLC/settlement choices, alternative public feeds) are documented.
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
import math
import pandas as pd

S = {"bull":"BULLISH", "bear":"BEARISH", "warn":"CAUTION", "na":"N/A"}
SHARED = ["oil", "usd", "tnx", "credit", "copper", "vix_curve"]
SP = ["vix", "spx_pc", "sp_def", "sp_xle", "sp_smh", "spy_trend", "rsp_spy", "iwm_spy", "sp_breadth1d"]
ND = ["vxn", "ndx_pc", "nd_def", "nd_xle", "nd_smh", "qqq_trend", "qqqe_qqq", "iwm_qqq", "nd_breadth1d"]
LABELS = {
 "vix":"VIX", "vxn":"VXN", "oil":"Crude Oil", "usd":"US Dollar", "tnx":"10Y Yield", "credit":"Credit HYG/IEF", "copper":"Copper", "vix_curve":"VIX Curve",
 "spx_pc":"SPX Put/Call", "sp_def":"Defensives/SPY", "sp_xle":"XLE/SPY", "sp_smh":"SMH/SPY", "spy_trend":"SPY Trend", "rsp_spy":"RSP/SPY", "iwm_spy":"IWM/SPY", "sp_breadth1d":"S&P Breadth 1D", "sp_breadth5d":"S&P Breadth 5D", "sp_breadth200":"S&P Breadth 200D",
 "ndx_pc":"NDX Put/Call", "nd_def":"Defensives/QQQ", "nd_xle":"XLE/QQQ", "nd_smh":"SMH/QQQ", "qqq_trend":"QQQ Trend", "qqqe_qqq":"QQQE/QQQ", "iwm_qqq":"IWM/QQQ", "nd_breadth1d":"Nasdaq Breadth 1D", "nd_breadth5d":"Nasdaq Breadth 5D",
}
DEPENDENCIES = {
 "spx_pc":"Thinkorswim $PCSP requires an independently licensed/authorized data feed",
 "ndx_pc":"Thinkorswim $PCND requires an independently licensed/authorized data feed",
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
    f["spy_ma50"],f["spy_ma200"],f["qqq_ma50"],f["qqq_ma200"] = ma(spy,50),ma(spy,200),ma(qqq,50),ma(qqq,200)
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
    # put/call 1.35+: yellow washout label BUT bearish +1 in the underlying script
    for key,col in (("spx_pc","SPX_PCR"),("ndx_pc","NDX_PCR")):
        def pc(x):
            return ("wash" if x>=1.35 else "bear" if x>1.00 else "bull",
                    "WASHOUT?" if x>=1.35 else "BEARISH" if x>1.00 else "BULLISH",
                    x,"Washout is yellow but contributes a bearish point")
        condition(key,[col],pc,src(col))
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


def score_of(signals, keys):
    valid=[k for k in keys if signals[k].state!="na"]
    bears=sum(signals[k].state in ("bear","wash") for k in valid)
    missing=len(keys)-len(valid)
    def regime(n): return "RISK-ON" if n<=4 else "CAUTION" if n<=7 else "RISK-OFF"
    low,high=regime(bears),regime(bears+missing)
    return {"bearish":bears,"possible_max":bears+missing,"total":len(keys),"available":len(valid),"missing":missing,"regime":low if low==high else "INCOMPLETE","complete":missing==0,"available_keys":valid}


def analyze(prices:pd.DataFrame,extra:pd.DataFrame|None=None, sources:dict|None=None, history_days=100):
    f=build_frames(prices,extra)
    if "SPY" not in f or "QQQ" not in f: raise ValueError("SPY and QQQ historical prices required")
    dates=f.index[f["SPY"].notna() & f["QQQ"].notna()]
    if len(dates)<1: raise ValueError("No common SPY and QQQ daily trading session")
    # Avoid displaying a stale previous session as if it were current: UI clearly shows actual session.
    d=dates[-1]
    indexpos=f.index.get_loc(d)
    records=[]
    # More days retained so 5D analytics compare the same available inputs.
    for pos in range(max(0,indexpos-history_days-8),indexpos+1):
        day,sigs=build_day(f,pos,sources)
        records.append({"date":day,"signals":sigs,"sp":score_of(sigs,SHARED+SP),"nd":score_of(sigs,SHARED+ND)})
    latest=records[-1]
    def momentum(index):
        today=latest[index]
        def change(days):
            if len(records)<=days: return None
            before=records[-1-days][index]
            if before["available_keys"]!=today["available_keys"]: return None
            return today["bearish"]-before["bearish"]
        d1,d5=change(1),change(5)
        state="N/A" if d5 is None else "IMPROVING" if d5<=-2 else "DETERIORATING" if d5>=2 else "STABLE"
        return {"d1":d1,"d5":d5,"state":state,"partial":not today["complete"]}
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
        sc=latest[index]; mom=latest[index+"_momentum"]; conf=latest[index+"_confirmation"]
        if not sc["complete"] or mom["d5"] is None or conf["available"]!=4: return "N/A"
        beartrend=latest["signals"]["spy_trend" if index=="sp" else "qqq_trend"].state=="bear"
        if sc["bearish"]<=4 and mom["d5"]<2 and conf["confirmed"]>=3 and not beartrend: return "BULLISH"
        if sc["bearish"]>=8 and mom["d5"]<=-2 and conf["confirmed"]>=2: return "EARLY IMPROVEMENT"
        if sc["bearish"]>=8: return "BEARISH"
        if 5<=sc["bearish"]<=7 and mom["d5"]>=2: return "DETERIORATING"
        return "SELECTIVE"
    latest["sp_swing"]=swing("sp")
    latest["nd_swing"]=swing("nd")
    latest["signals"]={k:v.json() for k,v in latest["signals"].items()}
    def prune_sc(x): return {k:v for k,v in x.items() if k!="available_keys"}
    latest["sp"]=prune_sc(latest["sp"]); latest["nd"]=prune_sc(latest["nd"])
    history=[{"date":r["date"],"sp":r["sp"]["bearish"],"sp_available":r["sp"]["available"],"nd":r["nd"]["bearish"],"nd_available":r["nd"]["available"]} for r in records[-90:]]
    return {"session":latest["date"],"generated_at":datetime.now(timezone.utc).isoformat(),"mode":"LIVE AUTOMATED / PARTIAL WHEN FEEDS MISSING", "method":"Daily-bar port of Thinkorswim rules; not a live brokerage feed", "markets":{"sp500":{"score":latest["sp"],"momentum":latest["sp_momentum"],"confirmation":latest["sp_confirmation"],"swing":latest["sp_swing"]},"nasdaq100":{"score":latest["nd"],"momentum":latest["nd_momentum"],"confirmation":latest["nd_confirmation"],"swing":latest["nd_swing"]}},"signals":latest["signals"],"history":history,"order":{"shared":SHARED,"sp500":SP+["sp_breadth5d","sp_breadth200"],"nasdaq100":ND+["nd_breadth5d"]},"names":LABELS,"explanation":{"missing":"Put/call feeds still require an authorized source. Breadth may be estimated from current constituents and unofficial price history when coverage is adequate; otherwise N/A.","partial":"Score is an interval when signals are missing. Green/risk-on is never inferred from absent bearish points.","rights":"Confirm provider display and redistribution permissions before publishing derived data publicly."}}
