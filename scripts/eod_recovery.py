"""Conservative completed-session SPY/QQQ close recovery.

Some Yahoo multi-ticker daily-history downloads temporarily omit the most
recent bar.  When this happens, independently request *daily*, not intraday,
bars for the missing equity ETF.  Never synthesize a price or move the
market session forward without a dated, valid daily close from the feed.
"""
from __future__ import annotations

from datetime import date
import math
import pandas as pd


def _close_series(data, symbol: str) -> pd.Series:
    """Normalize the daily Close from Ticker.history or yf.download."""
    if data is None or not isinstance(data, pd.DataFrame) or data.empty:
        return pd.Series(dtype=float)
    sub = data
    if isinstance(sub.columns, pd.MultiIndex):
        if symbol in sub.columns.get_level_values(0):
            sub = sub[symbol]
        elif symbol in sub.columns.get_level_values(1):
            sub = sub.xs(symbol, axis=1, level=1)
    if 'Close' not in sub.columns:
        return pd.Series(dtype=float)
    raw = sub['Close']
    if isinstance(raw, pd.DataFrame):
        if symbol in raw.columns:
            raw = raw[symbol]
        elif raw.shape[1] == 1:
            raw = raw.iloc[:, 0]
        else:
            return pd.Series(dtype=float)
    values = pd.to_numeric(raw, errors='coerce')
    idx = pd.DatetimeIndex(pd.to_datetime(values.index, errors='coerce'))
    # A daily bar is dated in the exchange calendar; do not convert it to UTC
    # and accidentally shift a midnight timestamp into a different date.
    if idx.tz is not None:
        idx = idx.tz_convert('America/New_York').tz_localize(None)
    values.index = idx.normalize()
    values = values.loc[~values.index.isna() & values.notna() & (values > 0)]
    return values[~values.index.duplicated(keep='last')].sort_index()


def recover_missing_equity_closes(prices: dict, sources: dict, diagnostics: list,
                                  required_day: date, ticker_factory=None,
                                  download=None) -> dict:
    """Recheck the current EOD session separately when SPY/QQQ are behind.

    Mutates prices/sources only on provider-confirmed, dated, finite positive
    closes.  Keeps all historical entries from the long-window download.
    Reports per-symbol availability to aid GitHub Actions troubleshooting.
    """
    if ticker_factory is None or download is None:
        import yfinance as yf
        ticker_factory = ticker_factory or yf.Ticker
        download = download or yf.download
    target = pd.Timestamp(required_day)
    status = {}
    for symbol in ('SPY', 'QQQ'):
        original = prices.get(symbol)
        existing = original if isinstance(original, pd.Series) else pd.Series(dtype=float)
        latest = existing.dropna().index.max() if not existing.dropna().empty else None
        if latest is not None and pd.Timestamp(latest).normalize() >= target:
            status[symbol] = 'already current'
            continue
        before = latest.strftime('%Y-%m-%d') if latest is not None else 'missing'
        status[symbol] = f'not available (initial {before})'
        strategies = [
            ('Ticker.history(10d)', lambda: ticker_factory(symbol).history(
                period='10d', interval='1d', auto_adjust=False, actions=False, timeout=25)),
            ('download(10d)', lambda: download(
                tickers=symbol, period='10d', interval='1d', auto_adjust=False,
                threads=False, progress=False, group_by='ticker', timeout=25)),
        ]
        for label, fetch in strategies:
            try:
                fresh = _close_series(fetch(), symbol)
            except Exception as exc:
                diagnostics.append(f'{symbol} fresh EOD {label}: {type(exc).__name__}: {str(exc)[:100]}')
                continue
            # Do not permit an older bar, or a feed's premature future date,
            # to masquerade as the required completed session.
            if target not in fresh.index:
                diagnostics.append(f'{symbol} fresh EOD {label}: required {required_day} not returned')
                continue
            value = float(fresh.loc[target])
            if not math.isfinite(value) or value <= 0:
                diagnostics.append(f'{symbol} fresh EOD {label}: invalid close for {required_day}')
                continue
            # Only add truly missing newer bars, retaining the previous
            # historical series and avoiding a silent full-history rewrite.
            addition = fresh.loc[fresh.index > pd.Timestamp(latest)] if latest is not None else fresh
            updated = pd.concat([existing, addition])
            updated = updated[~updated.index.duplicated(keep='last')].sort_index()
            prices[symbol] = updated
            sources[symbol] = f'Yahoo Finance via yfinance ({symbol}); latest EOD recovered with {label}'
            status[symbol] = f'recovered {required_day} using {label}'
            break
    return status
