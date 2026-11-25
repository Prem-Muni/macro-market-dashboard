"""Verification gate for a new EOD dashboard snapshot.

The market-health engine and the price-summary builder must have used the same
completed SPY/QQQ equity session before *any* new JSON/archive is published.
This check deliberately does not infer a missing market close from RSI, MACD,
TradingView, or earlier archive records.
"""
from __future__ import annotations
import math
from datetime import date


def _positive(v) -> bool:
    try:
        n = float(v)
        return math.isfinite(n) and n > 0
    except (TypeError, ValueError):
        return False


def check_completed_snapshot(result: dict, required_day: date | None = None) -> None:
    session = result.get('session')
    if not isinstance(session, str):
        raise RuntimeError('EOD VERIFICATION FAILED: invalid scored session date')
    try:
        if date.fromisoformat(session).isoformat() != session:
            raise ValueError('invalid date')
    except ValueError as exc:
        raise RuntimeError('EOD VERIFICATION FAILED: invalid scored session date') from exc
    if required_day and session != required_day.isoformat():
        raise RuntimeError(f'EOD VERIFICATION FAILED: scored session {session} != expected completed session {required_day}')
    price = result.get('price_moves') or {}
    if price.get('status') != 'complete' or price.get('session') != session:
        raise RuntimeError(f'EOD VERIFICATION FAILED: {session} has no complete, same-session SPY/QQQ close comparison (status: {price.get("status", "missing")}); preserving saved snapshot')
    prior = price.get('previous_session')
    try:
        if not prior or not date.fromisoformat(prior) < date.fromisoformat(session):
            raise ValueError('prior session missing/invalid')
    except ValueError as exc:
        raise RuntimeError('EOD VERIFICATION FAILED: previous price session missing or invalid') from exc
    for sym in ('spy', 'qqq'):
        row = price.get(sym) or {}
        if not _positive(row.get('close')) or not _positive(row.get('previous_close')):
            raise RuntimeError(f'EOD VERIFICATION FAILED: missing {sym.upper()} closing prices for {session}')
        expected = (float(row['close']) / float(row['previous_close'])-1)*100
        try:
            delta = float(row.get('change_pct'))
        except (TypeError,ValueError) as exc:
            raise RuntimeError(f'EOD VERIFICATION FAILED: missing {sym.upper()} daily percentage') from exc
        if not math.isfinite(delta) or abs(delta-expected)>0.025:
            raise RuntimeError(f'EOD VERIFICATION FAILED: inconsistent {sym.upper()} daily percent change')
        ma = (result.get('moving_averages') or {}).get(sym, {})
        # A price reported in Technicals on a different date must not be shown
        # as confirmation of this session's score. Missing technicals can be
        # informationally unavailable, so only check if values are supplied.
        if ma.get('as_of') and ma['as_of'] != session:
            raise RuntimeError(f'EOD VERIFICATION FAILED: {sym.upper()} Technicals date {ma["as_of"]} differs from score session {session}')
        if _positive(ma.get('close')) and abs(float(ma['close'])-float(row['close']))>0.05:
            raise RuntimeError(f'EOD VERIFICATION FAILED: {sym.upper()} Technicals close differs from EOD price')
    for key in ('sp500', 'nasdaq100'):
        score = ((result.get('markets') or {}).get(key) or {}).get('score') or {}
        if score.get('total') != 16:
            raise RuntimeError(f'EOD VERIFICATION FAILED: {key} no longer uses 16-point model')
        if not isinstance(score.get('available'), int) or not 0 <= score['available'] <= 16:
            raise RuntimeError(f'EOD VERIFICATION FAILED: invalid {key} signal coverage')
    # Missing breadth is allowed as an explicit interval, not as 16/16.
