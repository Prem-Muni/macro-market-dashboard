"""Experimental constituent-derived breadth estimates, not official index breadth.

Sources: community-maintained Wikipedia current constituents and unofficial yfinance
adjusted historical closes. Publication or redistribution may require permissions.

A fixed, sufficiently complete universe is required for every daily comparison.
If coverage or history is insufficient, nothing is published as market breadth.
"""
from __future__ import annotations
import io
import logging
import re
import time
from typing import Callable
import pandas as pd
import requests

INDEX_URLS = {
    "SP500": "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
    "NDX100": "https://en.wikipedia.org/wiki/List_of_NASDAQ-100_companies",
}
MIN_MEMBERS = {"SP500": (450, 550), "NDX100": (90, 115)}
REQUIRED_COVERAGE = 0.95
LOG = logging.getLogger(__name__)


def normalize_ticker(raw: str) -> str | None:
    """Convert public-index ticker forms to Yahoo symbols."""
    s = re.sub(r"\[[^]]*\]", "", str(raw)).strip().upper()
    if not re.fullmatch(r"[A-Z0-9.\-]{1,12}", s):
        return None
    return s.replace(".", "-")


def extract_tickers(html: str, index_name: str) -> list[str]:
    """Accept a suitably sized constituent table, avoiding unrelated tables."""
    if index_name not in MIN_MEMBERS:
        raise ValueError(f"Unknown index: {index_name}")
    expected = "Symbol" if index_name == "SP500" else "Ticker"
    tables = pd.read_html(io.StringIO(html), match=expected)
    candidates = []
    for table in tables:
        # Flatten multi-index headers, if Wikipedia changes formatting.
        t = table.copy()
        t.columns = [" ".join(str(v) for v in col) if isinstance(col, tuple)
                     else str(col) for col in t.columns]
        matching = [c for c in t.columns if re.search(r"\b" + expected + r"\b", c, re.I)]
        if not matching:
            continue
        syms = list(dict.fromkeys(filter(None, (normalize_ticker(x) for x in t[matching[0]].tolist()))))
        lo, hi = MIN_MEMBERS[index_name]
        if lo <= len(syms) <= hi:
            candidates.append(syms)
    if not candidates:
        raise ValueError(f"No plausible {index_name} constituent table; refusing to guess membership")
    return max(candidates, key=len)


def load_membership(session: requests.Session | None = None) -> dict[str, list[str]]:
    client = session or requests.Session()
    result = {}
    for index_name, url in INDEX_URLS.items():
        resp = client.get(url, headers={
            "User-Agent": "MacroDecisionDashboardLearningProject/0.2 (research; rate-limited; browser-compatible)",
            "Accept": "text/html",
        }, timeout=25)
        resp.raise_for_status()
        result[index_name] = extract_tickers(resp.text, index_name)
    return result


def _close_from_batch(frame: pd.DataFrame, ticker: str) -> pd.Series | None:
    if frame is None or frame.empty:
        return None
    try:
        if isinstance(frame.columns, pd.MultiIndex):
            if ticker in frame.columns.get_level_values(0):
                col = frame[ticker]["Close"]
            elif ticker in frame.columns.get_level_values(1):
                col = frame.xs(ticker, axis=1, level=1)["Close"]
            else:
                return None
        else:
            col = frame["Close"]
        if isinstance(col, pd.DataFrame):
            col = col.iloc[:, 0]
        ser = pd.to_numeric(col, errors="coerce").dropna()
        if ser.empty:
            return None
        idx = pd.DatetimeIndex(ser.index)
        idx = idx.tz_localize(None) if idx.tz is None else idx.tz_convert(None)
        ser.index = idx.normalize()
        return ser[~ser.index.duplicated(keep="last")]
    except (KeyError, ValueError, IndexError):
        return None


def acquire_closes(tickers: list[str], downloader: Callable | None = None, batch_size: int = 40, max_seconds: int = 350):
    """Batched yfinance history. No per-ticker retry storm on throttling."""
    if downloader is None:
        import yfinance as yf
        downloader = yf.download
    out = {}
    failures = []
    started = time.monotonic()
    for ix in range(0, len(tickers), batch_size):
        if time.monotonic() - started > max_seconds:
            failures.append("Breadth time budget reached; incomplete coverage remains N/A")
            break
        batch = tickers[ix:ix + batch_size]
        try:
            frame = downloader(tickers=batch, start=(pd.Timestamp.now(tz="UTC").tz_localize(None).normalize()
                                      -pd.DateOffset(months=34)).strftime("%Y-%m-%d"), interval="1d",
                               group_by="ticker", auto_adjust=True,
                               progress=False, threads=4, timeout=25)
            for ticker in batch:
                series = _close_from_batch(frame, ticker)
                if series is not None and len(series) >= 200:
                    out[ticker] = series
        except Exception as exc:
            failures.append(f"Batch {1 + ix // batch_size}: {type(exc).__name__}")
        # Avoid bursts against an unofficial provider.
        if ix + batch_size < len(tickers) and downloader.__module__.startswith("yfinance"):
            time.sleep(1.0)
    return out, failures


def calculate_breadth(sessions: pd.DatetimeIndex, membership: dict[str, list[str]],
                      closes: dict[str, pd.Series], min_fraction: float = REQUIRED_COVERAGE):
    """Return SPX_BREADTH200, NDX_ADV, NDX_DECL; null when the feed is incomplete.

    SP500: percent of a *fixed, covered universe* above own 200D adjusted-close SMA.
    NDX100: fixed-universe number advancing/declining from preceding closing session.
    Validates last 12 dates for SP and last 16 dates for NDX, so momentum is comparable.
    """
    dates = pd.DatetimeIndex(sessions)
    dates = dates.tz_localize(None) if dates.tz is None else dates.tz_convert(None)
    dates = dates.normalize().sort_values()
    output = pd.DataFrame(index=dates, columns=["SPX_BREADTH200", "NDX_ADV", "NDX_DECL"], dtype=float)
    messages, coverage = [], {}
    normalized = {}
    for idx, universe in membership.items():
        universe = list(dict.fromkeys(universe))
        usable = {}
        for ticker in universe:
            if ticker in closes:
                ser = closes[ticker]
                vals = pd.to_numeric(ser, errors="coerce")
                ids = pd.DatetimeIndex(vals.index)
                ids = ids.tz_localize(None) if ids.tz is None else ids.tz_convert(None)
                vals.index = ids.normalize()
                usable[ticker] = vals.reindex(dates)
        if not usable:
            coverage[idx] = 0
            messages.append(f"{idx}: no constituent histories")
            continue
        frame = pd.DataFrame(usable, index=dates)
        if idx == "SP500":
            ma = frame.rolling(200, min_periods=200).mean()
            lookback = 11
            valid = frame.iloc[-lookback:].notna().all(axis=0) & ma.iloc[-lookback:].notna().all(axis=0)
        else:
            delta = frame.diff()
            lookback = 16
            valid = frame.iloc[-lookback-1:].notna().all(axis=0) & delta.iloc[-lookback:].notna().all(axis=0)
        eligible = valid[valid].index.tolist() if len(dates) >= lookback + (1 if idx == "NDX100" else 199) else []
        ratio = len(eligible) / len(universe)
        coverage[idx] = round(ratio * 100, 1)
        if ratio < min_fraction:
            messages.append(f"{idx}: {ratio:.1%} complete histories, below {min_fraction:.0%} coverage; N/A")
            continue
        if idx == "SP500":
            # Fixed denominator across sessions avoids false day-to-day breadth swings.
            daily_coverage = frame[eligible].notna() & ma[eligible].notna()
            enough = daily_coverage.sum(axis=1) >= min_fraction * len(eligible)
            # Keep a fixed denominator and reject dates with inadequate coverage;
            # historical missing stock data must not turn into bearish breadth.
            ratio_series = frame[eligible].gt(ma[eligible]).sum(axis=1).div(len(eligible)).mul(100)
            output["SPX_BREADTH200"] = ratio_series.where(enough)
        else:
            eligible_delta = delta[eligible]
            daily_coverage = frame[eligible].notna() & frame[eligible].shift(1).notna()
            enough = daily_coverage.sum(axis=1) >= min_fraction * len(eligible)
            output["NDX_ADV"] = eligible_delta.gt(0).sum(axis=1).astype(float).where(enough)
            output["NDX_DECL"] = eligible_delta.lt(0).sum(axis=1).astype(float).where(enough)
    return output, coverage, messages


def derive_breadth(sessions: pd.DatetimeIndex):
    """Network-dependent optional operation. Its failures never invent scores."""
    errors = []
    try:
        membership = load_membership()
    except Exception as exc:
        return None, {}, [f"Constituent membership unavailable: {type(exc).__name__}: {str(exc)[:120]}"]
    all_tickers = sorted(set(membership["SP500"]) | set(membership["NDX100"]))
    closes, dl_errors = acquire_closes(all_tickers)
    errors.extend(dl_errors)
    result, coverage, calc_errors = calculate_breadth(sessions, membership, closes)
    errors.extend(calc_errors)
    return result, coverage, errors
