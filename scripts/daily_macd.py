"""Daily SPY/QQQ MACD on unadjusted completed-session closes.

MACD line = EMA(12) - EMA(26); signal = EMA(9) of MACD; histogram = line - signal.
The 16-point engine independently computes the same EMA series for each historical session.
"""
from __future__ import annotations
import math
import pandas as pd


def calculate_daily_macd(equity_sessions: pd.DataFrame, session: str) -> dict:
    """Produce session-aligned MACD readings or explicit N/A status, never guesses."""
    payload = {"parameters": {"fast": 12, "slow": 26, "signal": 9},
               "source": "unadjusted SPY/QQQ daily closes, same sessions as scored EOD model",
               "scored": True}
    end = pd.Timestamp(session)
    valid = equity_sessions.loc[equity_sessions.index <= end]
    for symbol in ("SPY", "QQQ"):
        key = symbol.lower()
        record = {"as_of": session, "status": "unavailable", "macd": None,
                  "signal": None, "histogram": None, "relation": "N/A", "crossover": "none"}
        if symbol not in valid or valid.empty or valid.index.max().normalize() != end.normalize():
            payload[key] = record
            continue
        closes = pd.to_numeric(valid[symbol], errors="coerce").dropna().astype(float)
        if len(closes) < 35 or closes.index[-1].normalize() != end.normalize() or (closes <= 0).any():
            payload[key] = record
            continue
        fast = closes.ewm(span=12, adjust=False, min_periods=12).mean()
        slow = closes.ewm(span=26, adjust=False, min_periods=26).mean()
        line = fast - slow
        sig = line.ewm(span=9, adjust=False, min_periods=9).mean()
        hist = line - sig
        if len(hist.dropna()) < 2 or not all(math.isfinite(float(x)) for x in (line.iloc[-1], sig.iloc[-1], hist.iloc[-1], hist.iloc[-2])):
            payload[key] = record
            continue
        today, yesterday = float(hist.iloc[-1]), float(hist.iloc[-2])
        crossover = "bullish" if yesterday <= 0 < today else "bearish" if yesterday >= 0 > today else "none"
        record.update({"status": "complete", "macd": round(float(line.iloc[-1]), 5),
                       "signal": round(float(sig.iloc[-1]), 5), "histogram": round(today, 5),
                       "relation": "above" if today > 0 else "below" if today < 0 else "equal",
                       "crossover": crossover})
        payload[key] = record
    return payload
