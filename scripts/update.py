#!/usr/bin/env python3
"""Scheduled EOD updater. Requires network and permitted public/personal research feeds.

Never inserts guessed market data. On failure, retains last verified snapshot on disk.
"""
from __future__ import annotations
import io
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pandas as pd
import requests
from engine import analyze
from breadth import derive_breadth
from price_risk import build_price_moves
from insights_history import merge_daily_archive
from daily_macd import calculate_daily_macd
from eod_freshness import check_snapshot_session, expected_close
from eod_recovery import recover_missing_equity_closes
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"docs"/"data"
OUT=DATA/"latest.json"
SYMBOLS={
 "SPY":"SPY", "QQQ":"QQQ", "RSP":"RSP", "QQQE":"QQQE", "IWM":"IWM", "SMH":"SMH",
 "XLE":"XLE", "XLP":"XLP", "XLV":"XLV", "XLU":"XLU", "HYG":"HYG", "IEF":"IEF",
 "OIL":"CL=F", "COPPER":"HG=F", "USD":"DX-Y.NYB", "TNX":"^TNX",
 "VIX":"^VIX", "VXN":"^VXN", "VIX3M":"^VIX3M",
}
FALLBACKS={"USD":"UUP", "TNX":"^TNX"}
CBOE={k:f"https://cdn.cboe.com/api/global/us_indices/daily_prices/{k}_History.csv" for k in ("VIX","VXN","VIX3M")}
EXTRA_COLUMNS={"SPX_BREADTH200","NDX_ADV","NDX_DECL"}
# Twenty months of evaluated signals plus 200+ trading-session lookback.
# Use an explicit historical start: yfinance does not document 3y/20mo periods.
HISTORY_START=(pd.Timestamp.now(tz="UTC").tz_localize(None).normalize()
               -pd.DateOffset(months=34)).strftime("%Y-%m-%d")

def download_yahoo():
    import yfinance as yf
    series={}
    sources={}
    errors=[]
    names=list(SYMBOLS)
    # Chunks are gentler on an unofficial upstream. Per-symbol gaps remain N/A.
    for ix in range(0,len(names),5):
        batch=names[ix:ix+5]
        tickers=[SYMBOLS[k] for k in batch]
        try:
            data=yf.download(tickers=tickers,start=HISTORY_START,interval="1d",auto_adjust=False,threads=False,
                             group_by="ticker",progress=False,timeout=25)
        except Exception as exc:
            errors.append(f"Yahoo batch {tickers}: {exc}")
            continue
        for key,symbol in zip(batch,tickers):
            try:
                if isinstance(data.columns,pd.MultiIndex):
                    sub=data[symbol] if symbol in data.columns.get_level_values(0) else data.xs(symbol,axis=1,level=1)
                else: sub=data
                vals=pd.to_numeric(sub["Close"],errors="coerce").dropna()
                if vals.empty: continue
                vals.index=pd.DatetimeIndex(vals.index).tz_localize(None).normalize()
                series[key]=vals[~vals.index.duplicated(keep="last")]
                sources[key]=f"Yahoo Finance via yfinance (unofficial): {symbol}"
            except Exception as exc:
                errors.append(f"Yahoo symbol {symbol}: {exc}")
    for key,alt in FALLBACKS.items():
        if key in series and len(series[key])>20: continue
        try:
            data=yf.download(alt,start=HISTORY_START,interval="1d",auto_adjust=False,threads=False,progress=False,timeout=25)
            vals=data["Close"]
            if isinstance(vals,pd.DataFrame): vals=vals.iloc[:,0]
            vals=pd.to_numeric(vals,errors="coerce").dropna()
            if not vals.empty:
                vals.index=pd.DatetimeIndex(vals.index).tz_localize(None).normalize()
                series[key]=vals
                sources[key]=f"Yahoo Finance fallback (unofficial): {alt}"
        except Exception as exc: errors.append(f"Yahoo fallback {alt}: {exc}")
    return series,sources,errors


def official_cboe():
    result={}; sources={}; errors=[]
    session=requests.Session()
    session.headers.update({"User-Agent":"MacroMarketDashboard/0.1 personal-research"})
    for key,url in CBOE.items():
        try:
            r=session.get(url,timeout=30); r.raise_for_status()
            raw=r.text.splitlines()
            start=next(i for i,line in enumerate(raw) if line.upper().strip().lstrip('\ufeff').startswith("DATE,"))
            df=pd.read_csv(io.StringIO("\n".join(raw[start:])))
            df.columns=[str(c).strip().upper() for c in df.columns]
            dates=pd.to_datetime(df["DATE"],errors="coerce")
            close=pd.to_numeric(df["CLOSE"],errors="coerce")
            s=pd.Series(close.values,index=pd.DatetimeIndex(dates).tz_localize(None).normalize(),dtype=float).dropna().sort_index()
            if len(s)<30: raise ValueError("Less than 30 rows")
            result[key]=s[~s.index.duplicated(keep="last")]
            sources[key]=f"Cboe official historical CSV: {key}"
        except Exception as exc: errors.append(f"Cboe {key}: {exc}")
    return result,sources,errors


def load_extra():
    """Optional supplemental CSV, furnished by a licensed/authorized data provider.

    Valid input: date,SPX_BREADTH200,NDX_ADV,NDX_DECL
    SPX_BREADTH200 is in units 0..100 (e.g. 46.2, NOT 0.462).
    """
    frames=[]; errors=[]
    local=ROOT/"inputs"/"supplemental.csv"
    if local.exists():
        try: frames.append(pd.read_csv(local))
        except Exception as exc: errors.append(f"supplemental.csv: {exc}")
    url=os.environ.get("SUPPLEMENTAL_DATA_URL","").strip()
    if url:
        try:
            # Use URL secret, never print it or store it in the public JSON.
            r=requests.get(url,timeout=25);r.raise_for_status()
            frames.append(pd.read_csv(io.StringIO(r.text)))
        except Exception as exc: errors.append(f"supplemental remote: {type(exc).__name__}")
    if not frames: return None,errors
    df=pd.concat(frames,ignore_index=True)
    if "date" not in df.columns:
        errors.append("Supplemental CSV needs a 'date' column")
        return None,errors
    df=df[["date"]+[x for x in df.columns if x in EXTRA_COLUMNS]]
    df["date"]=pd.to_datetime(df["date"],errors="coerce").dt.normalize()
    df=df.dropna(subset=["date"]).drop_duplicates(subset=["date"],keep="last").set_index("date")
    for col in df.columns:df[col]=pd.to_numeric(df[col],errors="coerce")
    if "SPX_BREADTH200" in df:
        bad=~df["SPX_BREADTH200"].between(0,100) & df["SPX_BREADTH200"].notna()
        df.loc[bad,"SPX_BREADTH200"]=float("nan")
        if bad.any():errors.append("Invalid breadth percentage outside 0..100 omitted")
    return df,errors


def main():
    DATA.mkdir(parents=True,exist_ok=True)
    prices,sources,errors=download_yahoo()
    # yfinance's historical batch request can lag a complete equity session.
    # Recheck missing SPY/QQQ closes individually before the strict EOD guard.
    # No single-symbol daily close => no update; preserve the prior snapshot.
    needed = expected_close()
    if needed is not None:
        refreshed = recover_missing_equity_closes(prices, sources, errors, needed)
        for symbol, outcome in refreshed.items():
            print(f"::notice::EOD equity close status: {symbol}: {outcome}")
    cboe,cb_sources,cb_err=official_cboe()
    errors+=cb_err
    # Prefer official Cboe indices; if official feed currently lags, use Yahoo for those missing sessions.
    for key,s in cboe.items():
        if key in prices:
            prices[key]=s.combine_first(prices[key]).sort_index()
            sources[key]=f"Cboe historical; Yahoo fallback on missing dates ({key})"
        else:
            prices[key]=s; sources[key]=cb_sources[key]
    extra,e_err=load_extra();errors+=e_err
    if not all(k in prices and len(prices[k])>200 for k in ("SPY","QQQ")):
        raise RuntimeError("SPY and QQQ daily histories are required; keeping prior snapshot")
    df=pd.concat(prices,axis=1).sort_index()
    # Crucial: use ONLY common SPY/QQQ equity sessions. Futures can have
    # separate Sunday bars; those must not count as extra daily lookback bars.
    df=df.loc[df["SPY"].notna() & df["QQQ"].notna()]
    # Optional constituent-derived breadth from current index membership and ETF
    # session-aligned historical closes. Estimate only; no official index feed.
    licensed_cols = set(extra.columns) if extra is not None else set()
    if os.environ.get("DISABLE_EXPERIMENTAL_BREADTH", "0") != "1":
        try:
            estimate, coverage, breadth_errors = derive_breadth(df.index)
            errors.extend(breadth_errors)
            if estimate is not None:
                # Licensed supplements, if present, always take precedence.
                if extra is None:
                    extra = estimate
                else:
                    extra = extra.combine_first(estimate)
                for source_col, index_name in (("SPX_BREADTH200", "SP500"),
                                                ("NDX_ADV", "NDX100"), ("NDX_DECL", "NDX100")):
                    if extra[source_col].notna().any():
                        # Existing authorized supplemental observations win over estimates.
                        has_authorized = (source_col in licensed_cols)
                        if has_authorized:
                            sources[source_col] = "User-provided supplemental breadth series (verify license)"
                        elif estimate[source_col].notna().any():
                            sources[source_col] = (f"EXPERIMENTAL constituent estimate; current Wikipedia membership; "
                                                   f"unofficial adjusted stock closes; {coverage.get(index_name, 0)}% coverage")
        except Exception as exc:
            errors.append(f"Estimated breadth not available: {type(exc).__name__}: {str(exc)[:120]}")
    # SPY session determines the website's EOD date; prevent a partial current-day candle.
    # Workflow scheduled after close; manual runs during market hours may include incomplete bars.
    result=analyze(df,extra,sources,history_months=20)
    # Workflow jobs can succeed even when the provider hasn't published today's
    # common completed SPY/QQQ daily bar. Never publish a regressed or stale
    # session as a fresh model update. Keep the prior JSON/history unchanged.
    previous_snapshot=json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    check_snapshot_session(result['session'],previous_snapshot.get('session'))
    # Add EOD price context from the SAME SPY/QQQ sessions as the risk engine.
    # This does not alter any scored inputs, regimes, or past returns.
    result["price_moves"] = build_price_moves(df, result["session"])
    # EOD MACD(12,26,9), now the 16th scored signal, with additional
    # display values derived from the same completed EOD close series.
    result["daily_macd"] = calculate_daily_macd(df, result["session"])
    result["sources"]={k:{"provider":v,"latest_session":prices[k].dropna().index.max().strftime("%Y-%m-%d")}
                       for k,v in sources.items() if k in prices and not prices[k].dropna().empty}
    for key in ("SPX_BREADTH200", "NDX_ADV", "NDX_DECL"):
        if key in sources:
            last_date=(extra[key].dropna().index.max().strftime("%Y-%m-%d") if extra is not None and key in extra and not extra[key].dropna().empty else result["session"])
            result["sources"][key] = {"provider": sources[key], "latest_session": last_date}
    # GitHub workflow success does not guarantee vendors have published today's EOD bar.
    # This warning is informational, including on exchange holidays; never invent data.
    central_now = datetime.now(ZoneInfo("America/Chicago"))
    if central_now.weekday() < 5 and (central_now.hour, central_now.minute) >= (15, 15) and result["session"] < central_now.date().isoformat():
        message = (f"EOD provider lag / possible exchange holiday: latest priced session "
                   f"{result['session']} vs calendar date {central_now.date().isoformat()}. "
                   "A 4:15pm Central backup refresh is also scheduled on weekdays.")
        errors.insert(0, message)
        print("::warning::" + message)
    result["warnings"]=(errors[:12] + ["Constituent breadth, when shown, is an ESTIMATE using current membership and adjusted closes; NOT a licensed S&P/Nasdaq benchmark series.", "Unofficial price feeds can fail or change. Inspect N/A labels and actual session date.", "Backtest uses reconstructed daily data and current constituent membership; historical breadth estimates are NOT point-in-time and may be survivorship-biased.",
                 "Public redistribution or display of vendor price data may require permission. Dashboard displays derived states, not full raw histories."])
    # GitHub's existing workflow commits only docs/data/latest.json, so preserve
    # the append-only insight journal inside this file (no workflow edits needed).
    # Do not reconstruct earlier alerts from historical data.
    result["market_insights_history"] = merge_daily_archive(previous_snapshot, result)
    temporary=OUT.with_name("latest.json.tmp")
    try:
        temporary.write_text(json.dumps(result,indent=2,allow_nan=False)+"\n",encoding="utf-8")
        temporary.replace(OUT)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"Wrote {OUT}: {result['session']} | SP {result['markets']['sp500']['score']['available']}/{result['markets']['sp500']['score']['total']}, "
          f"ND {result['markets']['nasdaq100']['score']['available']}/{result['markets']['nasdaq100']['score']['total']}")
    for err in errors[:8]:print("WARNING:",err[:160])

if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("Updater failed, preserving prior published data:",type(exc).__name__,str(exc)[:300],file=sys.stderr)
        sys.exit(1)
