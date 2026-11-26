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
from types import SimpleNamespace
import pandas as pd
import requests
from engine import analyze, scored_signal_changes, score_momentum_bounds
from breadth import derive_breadth
from price_risk import build_price_moves
from insights_history import merge_daily_archive
from daily_macd import calculate_daily_macd
from eod_freshness import check_snapshot_session, expected_close, most_recent_completed_session, is_early_close
from source_audit import build_source_audit
from snapshot_integrity import check_completed_snapshot
from eod_recovery import recover_missing_equity_closes
from public_eod import recover_public_etf_closes
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


def is_same_session_quality_regression(previous_snapshot: dict, candidate: dict) -> bool:
    """Protect an already verified, same-session snapshot from losing coverage."""
    # A previously published unverified snapshot may have a newer date but
    # no completed prices. Always permit a *verified* replacement, even when
    # the raw breadth feed happens to be less complete on the retry.
    prior_price = previous_snapshot.get("price_moves") or {}
    newer_price = candidate.get("price_moves") or {}
    if (prior_price.get("status") != "complete" or
            prior_price.get("session") != previous_snapshot.get("session")) and (
            newer_price.get("status") == "complete" and
            newer_price.get("session") == candidate.get("session")):
        return False
    if (previous_snapshot.get("session") != candidate.get("session") or
            previous_snapshot.get("model_version") != candidate.get("model_version")):
        return False
    older = previous_snapshot.get("markets", {})
    newer = candidate.get("markets", {})
    for market in ("sp500", "nasdaq100"):
        old_score = older.get(market, {}).get("score", {})
        new_score = newer.get(market, {}).get("score", {})
        if (isinstance(old_score.get("available"), (int, float)) and
                isinstance(new_score.get("available"), (int, float)) and
                new_score["available"] < old_score["available"]):
            return True
    return False


def is_finalized_snapshot(snapshot: dict) -> bool:
    """A verified complete 16-point EOD record is immutable on normal refreshes."""
    try:
        check_completed_snapshot(snapshot)
        if not all(snapshot["markets"][m]["score"].get("complete") is True and
                   snapshot["markets"][m]["score"].get("available") == 16 and
                   snapshot["markets"][m]["score"].get("missing") == 0
                   for m in ("sp500", "nasdaq100")):
            return False
        return True
    except (RuntimeError, TypeError, KeyError, ValueError):
        return False


def use_published_prior(previous: dict, fresh: dict) -> None:
    """Compare the daily headline to the actual prior publication, not a rerun.

    Leave reconstructed research history and five-day model momentum unchanged.
    """
    if (not is_finalized_snapshot(previous) or
            previous.get("session") != fresh.get("price_moves", {}).get("previous_session") or
            previous.get("model_version") != fresh.get("model_version")):
        return
    prior_scores = {}
    for market in ("sp500", "nasdaq100"):
        before = previous["markets"][market]["score"]
        after = fresh["markets"][market]["score"]
        prior_scores[market] = {key: before[key] for key in ("bearish", "possible_max", "total", "available")}
        daily = score_momentum_bounds(after, before)
        fresh["markets"][market]["momentum"].update(d1=daily["observed"], d1_range=[daily["min"], daily["max"]])
    fresh["published_comparison"] = {"session": previous["session"], "markets": prior_scores, "basis": "saved complete EOD publication"}
    prev_sigs = {k: SimpleNamespace(**v) for k, v in previous.get("signals", {}).items() if isinstance(v, dict)}
    new_sigs = {k: SimpleNamespace(**v) for k, v in fresh.get("signals", {}).items() if isinstance(v, dict)}
    fresh["signal_changes"] = scored_signal_changes(prev_sigs, new_sigs, previous["session"], fresh["session"])


def main():
    DATA.mkdir(parents=True,exist_ok=True)
    needed = expected_close()
    prior = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    prior_day = prior.get('session')
    finalized = is_finalized_snapshot(prior)
    # No provider requests on holidays/weekends/pre-close if the latest saved
    # session is complete. Also skip ordinary same-session backup reruns.
    if finalized and (needed is None or prior_day >= needed.isoformat()):
        print(f'::notice::Finalized EOD session {prior_day} retained; no new completed session eligible.')
        return
    if needed is None:
        # Allow repair of incomplete scores OR incomplete prices only for the
        # most recent completed exchange session, never an intraday candle.
        try:
            prior_date = datetime.strptime(prior_day, '%Y-%m-%d').date()
            if not finalized and prior_date == most_recent_completed_session():
                needed = prior_date
                print(f'::notice::Repairing incomplete saved EOD session {needed}')
        except (ValueError, TypeError):
            pass
        if needed is None:
            print('::notice::No new regular completed session eligible; existing published snapshot retained.')
            return
    print(f'::notice::Verifying completed EOD session {needed}')
    prices,sources,errors=download_yahoo()
    # yfinance's historical batch request can lag a complete equity session.
    # Recheck missing SPY/QQQ closes individually before the strict EOD guard.
    # No single-symbol daily close => no update; preserve the prior snapshot.
    if needed is not None:
        refreshed = recover_missing_equity_closes(prices, sources, errors, needed)
        for symbol, outcome in refreshed.items():
            print(f"::notice::EOD Yahoo equity close status: {symbol}: {outcome}")
        # If Yahoo's latest daily close is still missing, try a DIFFERENT
        # no-key public Nasdaq ETF-history feed. Require matching prior dates and prices
        # before accepting a verified bar. Never synthesize any EOD close.
        recovered = recover_public_etf_closes(prices, sources, errors, needed)
        for symbol, outcome in recovered.items():
            if outcome != "already current via primary feed":
                print(f"::notice::Nasdaq public daily {symbol}: {outcome}")
        required_ts = pd.Timestamp(needed)
        missing = [symbol for symbol in ("SPY", "QQQ")
                   if symbol not in prices or required_ts not in prices[symbol].dropna().index]
        if missing:
            raise RuntimeError(
                f"EOD DATA NOT READY for {needed}: Yahoo and Nasdaq public history "
                f"lack verified completed daily closes for {', '.join(missing)}. "
                "Prior market snapshot preserved. See individual source notices above."
            )
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
    # Score only through the eligible completed equity session. A future-dated
    # vendor bar must not leak into the lookback or today's signal classification.
    df=df.loc[df.index <= pd.Timestamp(needed)]
    # Optional constituent-derived breadth from current index membership and ETF
    # session-aligned historical closes. Estimate only; no official index feed.
    licensed_cols = set(extra.columns) if extra is not None else set()
    if os.environ.get("DISABLE_EXPERIMENTAL_BREADTH", "0") != "1":
        try:
            estimate, coverage, breadth_errors = derive_breadth(df.index)
            errors.extend(breadth_errors)
            # Preserve the actionable breadth failure cause in GitHub Actions.
            # Previously it was often lost among the first 8 generic warnings.
            for breadth_message in breadth_errors:
                if breadth_message.startswith(("Breadth ", "SP500:", "NDX100:", "Constituent membership")):
                    print("::notice::" + breadth_message[:240])
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
    if "COPPER" in df and len(df) >= 2:
        print(f"::notice::Copper aligned dates: {df.index[-2].date()}, {df.index[-1].date()}; daily change classification input: {df['COPPER'].iloc[-1] - df['COPPER'].iloc[-2]:.8g}")
    result=analyze(df,extra,sources,history_months=20)
    # Workflow jobs can succeed even when the provider hasn't published today's
    # common completed SPY/QQQ daily bar. Never publish a regressed or stale
    # session as a fresh model update. Keep the prior JSON/history unchanged.
    previous_snapshot=json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    check_snapshot_session(result['session'],previous_snapshot.get('session'))
    # Price verification precedes the quality comparison, saving, and archive.
    # This prevents a premature trading-day score from appearing as completed
    # while the close/summary remains unavailable.
    result["price_moves"] = build_price_moves(df, result["session"])
    check_completed_snapshot(result, needed)
    # A same-session rerun must not erase a verified result with fewer signals.
    # Exception: a formerly *unverified* snapshot may be repaired in place.
    if previous_snapshot.get("session") == result.get("session") and is_finalized_snapshot(previous_snapshot):
        print("::notice::Finalized same-session snapshot retained; provider revisions require review.")
        return
    if is_same_session_quality_regression(previous_snapshot, result):
        print("::warning::Same-session refresh has fewer validated signals than the "
              "already verified snapshot; preserving the more complete prior result.")
        return
    # EOD MACD(12,26,9), now the 16th scored signal, with additional
    # display values derived from the same completed EOD close series.
    use_published_prior(previous_snapshot, result)
    result["daily_macd"] = calculate_daily_macd(df, result["session"])
    check_completed_snapshot(result, needed)
    result["source_audit"] = build_source_audit(df, extra, prices, sources, cboe, result["session"])
    result["source_audit"]["early_equity_close"] = is_early_close(needed)
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
                   "A 4:20pm Central backup refresh is also scheduled on weekdays.")
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
