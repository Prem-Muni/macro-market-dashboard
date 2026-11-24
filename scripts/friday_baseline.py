"""Documented one-time archive backfill from user's November 20, 2026 screenshots.

These are transcriptions of the *website's experimental 15-point EOD model*,
not independently verified exchange quotes. No November 19 ETF closing prices
were supplied; the Friday price change and price/risk alert are intentionally
not evaluated. Do not infer unseen QQQ signal changes from collapsed UI.
"""
from __future__ import annotations

from copy import deepcopy

FRIDAY_BASELINE_SESSION = "2026-11-20"

# The historical page uses the same version-1 entry shape as future EOD rows.
_BASELINE = {
    "session": "2026-11-20",
    "previous_session": "2026-11-19",  # Previous scored session shown in the screenshots
    "model": "15-point experimental",
    "record_source": "screenshot_backfill",
    "source_note": (
        "Friday, November 20, 2026 EOD website screenshots supplied by user. "
        "One-time baseline; no November 19 ETF close was supplied, so Friday's "
        "price return and price/risk alert were not evaluated. QQQ's collapsed "
        "fourth signal change was not visible."
    ),
    "baseline": True,
    "spy": {
        "previous_close": None,
        "close": 689.81,
        "price_change_pct": None,
        "score": 11, "available": 15, "total": 15, "regime": "RISK-OFF",
        "estimated_count": 1, "estimated_signals": ["sp_breadth1d"],
        "trend_5d": "DETERIORATING", "five_day_delta_range": [5, 5],
        "confirmation": {"confirmed": 0, "available": 4, "total": 4},
        "swing": "BEARISH",
        "previous_score": 12, "score_delta_1d": -1,
        "previous_regime": "RISK-OFF", "risk_transition": "unchanged",
        "price_risk_status": "uncertain",
        "price_risk_label": "Baseline only · previous ETF close unavailable; price/risk alert not evaluated",
        "baseline_context": {
            "volatility_index": {"name": "VIX", "value": 35.89, "state": "BEARISH"},
            "rsi14": 24.91,
            "index_specific_bearish": 7,
            "shared_macro_bearish": 4,
            "breadth_1d": {"state": "CONTRACTING", "value": -3.81, "units": "percentage points"},
            "breadth_5d": {"state": "CONTRACTING", "value": -18.44, "units": "percentage points"},
            "breadth_200d": {"state": "CAUTION", "value": 48.70, "units": "percent"},
            "sma": {"5D": 721.65, "20D": 747.81, "50D": 760.18, "100D": 759.40, "200D": 732.75},
        },
    },
    "qqq": {
        "previous_close": None,
        "close": 608.45,
        "price_change_pct": None,
        "score": 11, "available": 15, "total": 15, "regime": "RISK-OFF",
        "estimated_count": 1, "estimated_signals": ["nd_breadth1d"],
        "trend_5d": "STABLE", "five_day_delta_range": [1, 1],
        "confirmation": {"confirmed": 0, "available": 4, "total": 4},
        "swing": "BEARISH",
        "previous_score": 10, "score_delta_1d": 1,
        "previous_regime": "RISK-OFF", "risk_transition": "unchanged",
        "price_risk_status": "uncertain",
        "price_risk_label": "Baseline only · previous ETF close unavailable; price/risk alert not evaluated",
        "baseline_context": {
            "volatility_index": {"name": "VXN", "value": 45.25, "state": "BEARISH"},
            "rsi14": 26.63,
            "index_specific_bearish": 7,
            "shared_macro_bearish": 4,
            "breadth_1d": {"state": "CONTRACTING", "value": 19.39, "units": "advancers percent"},
            "breadth_5d": {"state": "CONTRACTING", "value": -32.14, "units": "percentage points"},
            "sma": {"5D": 646.34, "20D": 675.83, "50D": 710.96, "100D": 710.68, "200D": 683.06},
        },
    },
    "spy_qqq_divergence": "opposite_risk_moves",
    "signal_changes": {
        "status": "partial",
        "from_session": "2026-11-19", "to_session": "2026-11-20",
        "note": "Only changes visible in the user's screenshot were transcribed. One additional QQQ-specific change was collapsed and is not recorded here.",
        "groups": {
            "shared": {
                "new_bearish": [{"label": "Crude Oil", "before": "BULLISH DIV", "after": "BEARISH"}],
                "eased": [{"label": "US Dollar", "before": "BEARISH", "after": "BULLISH DIV"}],
                "other": [],
            },
            "sp": {
                "new_bearish": [],
                "eased": [{"label": "IWM/SPY", "before": "BEARISH", "after": "BULLISH"}],
                "other": [],
            },
            "nd": {
                "new_bearish": [
                    {"label": "Defensives/QQQ", "before": "CAUTION", "after": "BEARISH"},
                    {"label": "XLE/QQQ", "before": "BULLISH", "after": "BEARISH"},
                ],
                "eased": [{"label": "IWM/QQQ", "before": "BEARISH", "after": "BULLISH"}],
                "other": [],
            },
        },
    },
    "shared_macro_snapshot": {
        "bearish": 4, "total": 6,
        "oil": "BEARISH", "usd": "BULLISH DIV", "tnx": "BULLISH DIV",
        "credit": "BEARISH", "copper": "BEARISH", "vix_curve": "BACKWARDATION",
        "vix_curve_ratio": 1.16,
    },
    "external_sentiment_snapshot": {
        "provider_label": "FearGreedChart.com", "as_of": "2026-11-20",
        "value": 18, "classification": "Extreme Fear",
        "scored": False,
    },
}


def friday_baseline_entry() -> dict:
    """Return an independent copy, preventing accidental mutation of seed constants."""
    return deepcopy(_BASELINE)
