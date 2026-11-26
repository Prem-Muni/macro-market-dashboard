"""Session-aligned source diagnostics; no claims of independent vendor settlement.
Derived changes are published instead of additional raw vendor price histories.
"""
from __future__ import annotations
import math
import pandas as pd

def _finite(value):
    try:
        number=float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None

def build_source_audit(frame, extra, prices, providers, cboe, session):
    day=pd.Timestamp(session)
    if frame.empty or frame.index[-1] != day:
        raise ValueError("Source audit is not aligned with the scored session")
    previous=frame.index[-2] if len(frame)>1 else None
    observed={}
    expected = ("SPY","QQQ","RSP","QQQE","IWM","SMH","XLE","XLP","XLV","XLU","HYG","IEF","OIL","COPPER","USD","TNX","VIX","VXN","VIX3M","SPX_BREADTH200","NDX_ADV","NDX_DECL")
    for key in dict.fromkeys((*expected, *providers)):
        provider = providers.get(key, "No provider available")
        series=extra[key] if extra is not None and key in extra else frame[key] if key in frame else None
        actual=_finite(series.get(day)) if series is not None else None
        prior=_finite(series.get(previous)) if series is not None and previous is not None else None
        raw=prices.get(key,series)
        latest=None
        if raw is not None and not raw.dropna().empty:
            latest=raw.dropna().index.max().strftime("%Y-%m-%d")
        source=provider
        if key in ("VIX","VXN","VIX3M") and actual is not None:
            official=cboe.get(key)
            source=("Cboe official historical CSV" if official is not None and _finite(official.get(day)) is not None else "Yahoo fallback (unofficial)")
        item={"provider":source,"requested_session":session,"observation_session":session if actual is not None else None,
              "previous_observation_session":previous.strftime("%Y-%m-%d") if prior is not None else None,
              "latest_vendor_session":latest,"status":"same_date_observation" if actual is not None else "missing_for_session"}
        if key in ("OIL","COPPER"):
            delta=actual-prior if actual is not None and prior is not None else None
            item.update(daily_change=delta,change_pct=(100*delta/prior if delta is not None and prior else None),
                        direction=("up" if delta>0 else "down" if delta<0 else "flat") if delta is not None else "unavailable",
                        settlement_verified=False)
        observed[key]=item
    return {"version":1,"session":session,"previous_session":previous.strftime("%Y-%m-%d") if previous is not None else None,
            "observations":observed,"method":"Same-date provider bars; futures session and settlement can differ from equities. Source provenance is not independent price verification."}
