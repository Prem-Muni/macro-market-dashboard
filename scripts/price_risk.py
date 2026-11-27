"""Derive strictly session-aligned SPY/QQQ EOD close-to-close price changes.

Read only the same synchronized daily closes already used by the score engine.
No additional provider request, scoring adjustment, or synthesized price history.
"""
from __future__ import annotations

from datetime import datetime
from eod_freshness import CENTRAL, eod_cutoff, is_regular_session
import math

import pandas as pd


def build_price_moves(df: pd.DataFrame, session: str, *, now: datetime | None = None) -> dict:
    """Return the prior/current *common equity-session* closes and percentage changes.

    Use the shared NYSE session calendar and 15-minute EOD safety buffer.
    Return an explicit unavailable status if session/prices/history don't align.
    """
    base = {"session": session, "previous_session": None, "status": "unavailable", "spy": None, "qqq": None}
    try:
        target = pd.Timestamp(session).normalize()
        if not session or target.strftime("%Y-%m-%d") != session:
            return base
        current = now or datetime.now(CENTRAL)
        if current.tzinfo is None:
            return base  # Do not silently interpret naive clock datetimes.
        current = current.astimezone(CENTRAL)
        day = target.date()
        if day > current.date() or not is_regular_session(day):
            return base
        if day == current.date() and (current.hour, current.minute) < eod_cutoff(day):
            return {**base, "status": "awaiting_close"}
        if not {"SPY", "QQQ"}.issubset(df.columns):
            return base
        # Align both series to completed U.S. equity sessions; exclude later dates.
        clean = df[["SPY", "QQQ"]].copy()
        clean.index = pd.DatetimeIndex(clean.index).tz_localize(None).normalize()
        clean = clean.loc[clean.index <= target].sort_index()
        clean = clean[~clean.index.duplicated(keep="last")]
        for sym in ("SPY", "QQQ"):
            clean[sym] = pd.to_numeric(clean[sym], errors="coerce")
        clean = clean.dropna(subset=["SPY", "QQQ"])
        clean = clean[(clean["SPY"] > 0) & (clean["QQQ"] > 0)]
        if len(clean) < 2 or clean.index[-1] != target:
            return base
        prior, latest = clean.iloc[-2], clean.iloc[-1]
        prior_session = clean.index[-2].strftime("%Y-%m-%d")
        if prior_session >= session:
            return base
        out = {"session": session, "previous_session": prior_session, "status": "complete"}
        for sym, key in (("SPY", "spy"), ("QQQ", "qqq")):
            p, c = float(prior[sym]), float(latest[sym])
            pct = (c / p - 1.0) * 100.0
            if not all(math.isfinite(v) and v > 0 for v in (p, c)) or not math.isfinite(pct):
                return base
            out[key] = {"previous_close": round(p, 6), "close": round(c, 6), "change_pct": round(pct, 5)}
        return out
    except (ValueError, TypeError, KeyError, OverflowError):
        return base
