"""Append-only, completed-EOD market intelligence journal embedded in latest.json.

The existing GitHub workflow commits ONLY docs/data/latest.json. Keeping the journal
inside this same file gives it durable Git history without changing the deployment job.
No past alerts are reconstructed or fabricated from historical scores.
"""
from __future__ import annotations

import math
import re
from datetime import date
from typing import Any

VERSION = 1
ALERT_PCT = 2.0
INDEX_KEYS = {
    "spy": ("sp500", "sp", ["vix", "sp_def", "sp_xle", "sp_smh", "spy_trend", "sp_rsi14", "rsp_spy", "iwm_spy", "sp_breadth1d"]),
    "qqq": ("nasdaq100", "nd", ["vxn", "nd_def", "nd_xle", "nd_smh", "qqq_trend", "nd_rsi14", "qqqe_qqq", "iwm_qqq", "nd_breadth1d"]),
}
SHARED_KEYS = ["oil", "usd", "tnx", "credit", "copper", "vix_curve"]
SOURCE_MARKER = re.compile(r"ESTIMAT|EXPERIMENTAL|PROXY|CONSTITUENT.DERIVED", re.I)


def _valid_date(value: Any) -> bool:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        date.fromisoformat(value)
        return True
    except ValueError:
        return False


def _number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _risk(score: int, symbol: str) -> str:
    return "RISK-ON" if score <= (4 if symbol == "spy" else 5) else "CAUTION" if score <= 8 else "RISK-OFF"


def _score_now(result: dict, sym: str) -> dict:
    model_key, _, keys = INDEX_KEYS[sym]
    model = result.get("markets", {}).get(model_key, {})
    sc = model.get("score", {})
    available, total, bearish = (sc.get(k) for k in ("available", "total", "bearish"))
    if not all(isinstance(n, int) and not isinstance(n, bool) for n in (available, total, bearish)):
        raise ValueError("Invalid 15-point score object")
    if total != 15 or not 0 <= bearish <= available <= total:
        raise ValueError("Not a valid 15-point score")
    regime = _risk(bearish, sym) if available == total else "INCOMPLETE"
    actual = sc.get("regime")
    # An explicit engine regime must agree with our exact full-coverage policy.
    if available == total and actual != regime:
        raise ValueError("Score/regime mismatch; refusing to archive")
    signals = result.get("signals", {})
    estimated = [name for name in SHARED_KEYS + keys if SOURCE_MARKER.search(str(signals.get(name, {}).get("source") or ""))]
    mom = model.get("momentum", {})
    confirmed = model.get("confirmation", {})
    return {
        "score": bearish, "available": available, "total": total, "regime": regime,
        "estimated_count": len(estimated), "estimated_signals": estimated,
        "trend_5d": str(mom.get("state") or "N/A"),
        "five_day_delta_range": mom.get("d5_range") if isinstance(mom.get("d5_range"), list) else None,
        "confirmation": {
            "confirmed": confirmed.get("confirmed"), "available": confirmed.get("available"),
            "total": confirmed.get("total"),
        },
        "swing": model.get("swing") or "N/A",
    }


def _paired_prior(result: dict, previous_session: str, market: str) -> tuple[int | None, str]:
    history = result.get("history") or []
    if not isinstance(history, list) or len(history) < 2:
        return None, "unavailable"
    last, before = history[-1], history[-2]
    if last.get("date") != result.get("session") or before.get("date") != previous_session:
        return None, "unavailable"
    key = "sp" if market == "spy" else "nd"
    prev = before.get(key)
    prev_available = before.get(key + "_available")
    now = last.get(key)
    now_avail = last.get(key + "_available")
    if not all(isinstance(n, int) and not isinstance(n, bool) for n in (prev, prev_available, now, now_avail)):
        return None, "unavailable"
    if not (0 <= prev <= prev_available <= 15 and 0 <= now <= now_avail <= 15):
        return None, "unavailable"
    if prev_available != 15 or now_avail != 15:
        return None, "incomplete"
    return prev, _risk(prev, market)


def _changes(result: dict, from_session: str, to_session: str) -> dict:
    val = result.get("signal_changes") or {}
    if val.get("from_session") != from_session or val.get("to_session") != to_session:
        return {"status": "unavailable", "groups": {}}
    out = {}
    for section in ("shared", "sp", "nd"):
        raw = val.get("groups", {}).get(section, {})
        entry = {}
        for key in ("new_bearish", "eased", "other"):
            values = raw.get(key, [])
            entry[key] = [
                {field: str(item.get(field, ""))[:180] for field in ("label", "before", "after")}
                for item in values if isinstance(item, dict)
            ] if isinstance(values, list) else []
        out[section] = entry
    return {"status": "complete", "groups": out}


def make_daily_entry(result: dict) -> dict | None:
    """Return a validated, session-aligned record; otherwise skip the day."""
    session = result.get("session")
    moves = result.get("price_moves") or {}
    previous = moves.get("previous_session")
    if (moves.get("status") != "complete" or not _valid_date(session) or
            not _valid_date(previous) or previous >= session or moves.get("session") != session):
        return None
    out = {
        "session": session, "previous_session": previous, "model": "15-point experimental",
        "spy": {}, "qqq": {}, "signal_changes": _changes(result, previous, session),
    }
    for sym in ("spy", "qqq"):
        price = moves.get(sym) or {}
        p, c, pct = (price.get(k) for k in ("previous_close", "close", "change_pct"))
        ma = (result.get("moving_averages") or {}).get(sym) or {}
        if (not all(_number(n) for n in (p, c, pct)) or p <= 0 or c <= 0 or
                abs(100 * (c / p - 1) - pct) > .025 or
                ma.get("as_of") != session or not _number(ma.get("close")) or
                abs(c - ma["close"]) > .015):
            return None
        now = _score_now(result, sym)
        prevscore, prevregime = _paired_prior(result, previous, sym)
        if prevscore is not None and now["available"] == 15:
            delta = now["score"] - prevscore
        else:
            delta = None
        currentregime = now["regime"]
        if currentregime == "INCOMPLETE":
            alert = "uncertain"
            alert_title = "Score incomplete — no confirmed alert"
        elif pct >= ALERT_PCT and currentregime == "RISK-OFF":
            alert = "divergence"
            alert_title = "Strong rally · Risk-Off persists"
        elif pct <= -ALERT_PCT and currentregime == "RISK-ON":
            alert = "divergence"
            alert_title = "Sharp selloff · Risk-On persists"
        elif abs(pct) >= ALERT_PCT and currentregime == "CAUTION":
            alert = "watch"
            alert_title = "Large price move · Caution regime"
        elif abs(pct) >= ALERT_PCT:
            alert = "aligned"
            alert_title = "Large price move aligns with regime"
        else:
            alert = "none"
            alert_title = "No price/risk alert"
        out[sym] = {
            "previous_close": round(p, 4), "close": round(c, 4), "price_change_pct": round(pct, 5),
            **now, "previous_score": prevscore, "score_delta_1d": delta,
            "previous_regime": prevregime, "risk_transition":
                "uncertain" if prevregime in ("unavailable", "incomplete") or currentregime == "INCOMPLETE" else
                "unchanged" if prevregime == currentregime else "changed",
            "price_risk_status": alert, "price_risk_label": alert_title,
        }
    spy, qqq = out["spy"], out["qqq"]
    if spy["regime"] == "INCOMPLETE" or qqq["regime"] == "INCOMPLETE":
        diff = "uncertain"
    elif spy["score_delta_1d"] is not None and qqq["score_delta_1d"] is not None and (
          spy["score_delta_1d"] < 0 < qqq["score_delta_1d"] or
          qqq["score_delta_1d"] < 0 < spy["score_delta_1d"]):
        # Match the Market Intelligence card: opposite risk moves take priority
        # over a simultaneous regime split.
        diff = "opposite_risk_moves"
    elif spy["regime"] != qqq["regime"]:
        diff = "regime_split"
    elif spy["score_delta_1d"] is None or qqq["score_delta_1d"] is None:
        diff = "uncertain"
    else:
        diff = "none"
    out["spy_qqq_divergence"] = diff
    return out


def merge_daily_archive(previous: dict, fresh: dict) -> dict:
    """Retain all previously saved EOD records; add or update today's record only.

    Repeated runs for one completed session replace that day's record. Older sessions
    already archived are immutable (no retrospective reconstruction/overwriting).
    """
    old = previous.get("market_insights_history")
    if old is None:
        entries = []
    else:
        if not isinstance(old, dict) or old.get("version") != VERSION or not isinstance(old.get("entries"), list):
            raise ValueError("Existing saved history has an unknown format; preserving latest.json")
        entries = old["entries"].copy()
        dates = [row.get("session") for row in entries if isinstance(row, dict)]
        if len(dates) != len(entries) or any(not _valid_date(day) for day in dates) or dates != sorted(set(dates)):
            raise ValueError("Existing saved history is malformed; refusing to overwrite it")
    new = make_daily_entry(fresh)
    if new is not None:
        if not entries or new["session"] > entries[-1]["session"]:
            entries.append(new)
        elif new["session"] == entries[-1]["session"]:
            entries[-1] = new  # EOD correction during same session only
    return {"version": VERSION, "entries": entries}
