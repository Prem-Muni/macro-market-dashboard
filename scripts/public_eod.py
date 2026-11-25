"""Conservative no-key backup for dated *completed* ETF daily closes.

Attempts Nasdaq's public web quote-history endpoint after Yahoo's daily feed
lags. This is an unofficial public web endpoint, not an authorized/licensed EOD
feed: it may block automated clients or change without notice. Every accepted
row is cross-checked against the previously fetched daily Yahoo history.
No API key, other registration, or invented OHLC values are used.
"""
from __future__ import annotations

from datetime import date, timedelta
import math
import pandas as pd
import requests

PUBLIC_HISTORY_URL = "https://api.nasdaq.com/api/quote/{symbol}/historical"
EQUITY_ETFS = ("SPY", "QQQ", "RSP", "QQQE", "IWM", "SMH", "XLE", "XLP", "XLV", "XLU", "HYG", "IEF")
RELATIVE_OVERLAP_TOLERANCE = 0.015  # 1.5% maximum vendor-basis difference, per overlap date
MAX_ONE_SESSION_MOVE = 0.25       # sanity guard; >25% needs investigation rather than automatic splice
PUBLIC_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nasdaq.com",
    "Referer": "https://www.nasdaq.com/",
}


def _parse_nasdaq_history(payload: object) -> pd.Series:
    """Read exchange-dated rows. Reject unavailable/partial/invalid responses."""
    if not isinstance(payload, dict):
        raise ValueError("not a historical JSON response")
    record = payload.get("data")
    if not isinstance(record, dict) or not isinstance(record.get("tradesTable"), dict):
        raise ValueError("no tradesTable daily data (blocked/unavailable)")
    rows = record["tradesTable"].get("rows")
    if not isinstance(rows, list) or not rows:
        raise ValueError("no ETF daily historical rows returned")
    indexed = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            raw_date = str(row.get("date", "")).strip()
            day = pd.to_datetime(raw_date, format="%m/%d/%Y", errors="coerce")
            if pd.isna(day):
                day = pd.to_datetime(raw_date, format="%Y-%m-%d", errors="coerce")
            if pd.isna(day):
                continue
            raw_close = str(row.get("close", row.get("close/last", ""))).replace("$", "").replace(",", "").strip()
            close = float(raw_close)
            if not math.isfinite(close) or close <= 0:
                continue
            indexed[pd.Timestamp(day).normalize()] = close
        except (TypeError, ValueError):
            continue
    if not indexed:
        raise ValueError("no valid dated ETF closing prices")
    return pd.Series(indexed, dtype=float).sort_index()


def fetch_public_daily(symbol: str, target: date, get=None) -> pd.Series:
    """Request recent Nasdaq public daily ETF price rows without an API key."""
    if symbol not in EQUITY_ETFS:
        raise ValueError("unsupported public ETF symbol")
    get = get or requests.get
    params = {
        "assetclass": "etf", "limit": 40,
        "fromdate": (target - timedelta(days=32)).isoformat(),
        "todate": target.isoformat(),
    }
    response = get(PUBLIC_HISTORY_URL.format(symbol=symbol), params=params,
                   headers=PUBLIC_HEADERS, timeout=15)
    response.raise_for_status()
    return _parse_nasdaq_history(response.json())


def _valid_against_yahoo(existing: pd.Series, other: pd.Series, target: pd.Timestamp) -> tuple[bool,str]:
    """Reject inconsistent price scales, incomplete dates, or implausible splices."""
    if target not in other.index:
        return False, "required completed daily date absent"
    value = float(other.loc[target])
    if not math.isfinite(value) or value <= 0:
        return False, "invalid completed daily close"
    before = existing.dropna().loc[existing.dropna().index < target]
    if before.empty:
        return False, "no prior Yahoo prices to cross-check"
    matching = other.loc[other.index < target].index.intersection(before.index).sort_values()
    if len(matching) < 2:
        return False, "fewer than two overlapping dates for independent verification"
    matching = matching[-5:]
    yahoo_prices = before.loc[matching].to_numpy(dtype=float)
    alternate_prices = other.loc[matching].to_numpy(dtype=float)
    if not all(math.isfinite(x) and x > 0 for x in yahoo_prices):
        return False, "invalid Yahoo comparison close"
    errors = abs(alternate_prices / yahoo_prices - 1)
    if not (errors <= RELATIVE_OVERLAP_TOLERANCE).all():
        return False, f"different price basis across feeds (max {100*float(max(errors)):.2f}%)"
    last_yahoo = float(before.iloc[-1])
    if abs(value / last_yahoo - 1) > MAX_ONE_SESSION_MOVE:
        return False, "latest alternate close differs >25% from previous Yahoo close"
    return True, "verified dated daily close and overlapping prior prices"


def recover_public_etf_closes(prices: dict, sources: dict, errors: list,
                               required_day: date, fetch=None) -> dict:
    """Recover only *missing* verified daily ETF bars; preserve historical bars.

    Benchmarks SPY and QQQ must both be available before other ETF retrievals.
    VIX, futures, Treasury indices, and other non-ETF inputs are not fabricated.
    """
    fetch = fetch or fetch_public_daily
    target = pd.Timestamp(required_day)
    statuses = {}
    for symbol in EQUITY_ETFS:
        old = prices.get(symbol)
        if not isinstance(old, pd.Series):
            statuses[symbol] = "skipped: no primary-source comparison history"
            continue
        clean = pd.to_numeric(old, errors="coerce").dropna().sort_index()
        clean.index = pd.DatetimeIndex(clean.index).normalize()
        if target in clean.index and math.isfinite(float(clean.loc[target])) and float(clean.loc[target]) > 0:
            statuses[symbol] = "already current via primary feed"
            continue
        if symbol not in ("SPY", "QQQ") and any(
            target not in prices.get(benchmark, pd.Series(dtype=float)).dropna().index
            for benchmark in ("SPY", "QQQ")
        ):
            statuses[symbol] = "skipped: benchmark session not recovered"
            continue
        try:
            alternate = fetch(symbol, required_day)
            if not isinstance(alternate, pd.Series):
                raise ValueError("source did not return a price series")
            alternate = pd.to_numeric(alternate, errors="coerce").dropna().sort_index()
            alternate.index = pd.DatetimeIndex(alternate.index).normalize()
            accepted, why = _valid_against_yahoo(clean, alternate, target)
            if not accepted:
                raise ValueError(why)
        except Exception as exc:
            message = f"{type(exc).__name__}: {str(exc)[:115]}"
            statuses[symbol] = f"unavailable / rejected: {message}"
            errors.append(f"Nasdaq public daily {symbol}: {message}")
            continue
        added = pd.Series([float(alternate.loc[target])], index=[target], dtype=float)
        prices[symbol] = pd.concat([clean, added])[lambda s: ~s.index.duplicated(keep="last")].sort_index()
        sources[symbol] = "Yahoo historical + Nasdaq public ETF daily history (validated last bar; web endpoint subject to change)"
        statuses[symbol] = "recovered dated daily close; independent historical cross-check passed"
    return statuses
