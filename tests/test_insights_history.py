"""Synthetic tests: never published as market data."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from insights_history import make_daily_entry, merge_daily_archive


def synthetic_snapshot():
    return {
        "session": "2026-11-23",
        "price_moves": {
            "session": "2026-11-23", "previous_session": "2026-11-20", "status": "complete",
            "spy": {"previous_close": 689.81, "close": 722.29, "change_pct": round((722.29/689.81-1)*100, 5)},
            "qqq": {"previous_close": 608.45, "close": 651.03, "change_pct": round((651.03/608.45-1)*100, 5)},
        },
        "moving_averages": {"spy": {"as_of": "2026-11-23", "close": 722.29}, "qqq": {"as_of": "2026-11-23", "close": 651.03}},
        "markets": {
            "sp500": {"score": {"bearish": 10, "available": 15, "total": 15, "regime": "RISK-OFF"}, "momentum": {"state": "STABLE", "d5_range": [1, 1]}, "confirmation": {"confirmed": 0,"available":4,"total":4}, "swing": "BEARISH"},
            "nasdaq100": {"score": {"bearish": 11, "available": 15, "total": 15, "regime": "RISK-OFF"}, "momentum": {"state": "DETERIORATING", "d5_range": [2, 2]}, "confirmation": {"confirmed": 0,"available":4,"total":4}, "swing": "BEARISH"},
        },
        "signals": {"sp_breadth1d": {"source": "EXPERIMENTAL constituent estimate"}, "nd_breadth1d": {"source": "EXPERIMENTAL constituent estimate"}},
        "history": [
            {"date": "2026-11-20", "sp": 11, "sp_available":15, "nd":11,"nd_available":15},
            {"date": "2026-11-23", "sp":10,"sp_available":15,"nd":11,"nd_available":15},
        ],
        "signal_changes": {
            "from_session": "2026-11-20", "to_session": "2026-11-23",
            "groups": {
                "shared": {"new_bearish":[{"label":"US Dollar","before":"BULLISH","after":"BEARISH"}],"eased":[],"other":[]},
                "sp": {"new_bearish":[],"eased":[{"label":"S&P Breadth 1D","before":"CONTRACTING","after":"EXPANDING"}],"other":[]},
                "nd": {"new_bearish":[],"eased":[],"other":[]},
            },
        },
    }


class InsightsHistoryTests(unittest.TestCase):
    def test_monday_creates_two_divergences(self):
        row = make_daily_entry(synthetic_snapshot())
        self.assertIsNotNone(row)
        self.assertEqual((row['spy']['score'],row['qqq']['score']), (10,11))
        self.assertEqual((row['spy']['score_delta_1d'],row['qqq']['score_delta_1d']), (-1,0))
        self.assertEqual(row['spy']['price_risk_status'], 'divergence')
        self.assertEqual(row['qqq']['price_risk_status'], 'divergence')
        self.assertEqual(row['spy']['estimated_count'], 1)
        self.assertEqual(row['signal_changes']['groups']['sp']['eased'][0]['label'], 'S&P Breadth 1D')

    def test_first_run_adds_approved_friday_baseline_and_current_record(self):
        fresh=synthetic_snapshot()
        archive=merge_daily_archive({},fresh)
        self.assertEqual(len(archive['entries']),2)
        self.assertEqual(archive['entries'][0]['session'],'2026-11-20')
        self.assertTrue(archive['entries'][0]['baseline'])
        self.assertEqual(archive['entries'][1]['session'],fresh['session'])

    def test_complete_same_session_is_immutable(self):
        # Finalized archive policy: even a revised provider reading must not
        # replace a complete published session during an ordinary refresh.
        day=synthetic_snapshot()
        first=merge_daily_archive({},day)
        day['markets']['sp500']['momentum']['state']='IMPROVING'
        day['markets']['sp500']['score']['bearish']=5
        day['markets']['sp500']['score']['regime']='NEUTRAL'
        fixed=merge_daily_archive({'market_insights_history':first},day)
        self.assertEqual(fixed,first)
        self.assertEqual(fixed['entries'][1]['spy']['trend_5d'],'STABLE')

    def test_complete_16_point_session_cannot_change_regime_on_retry(self):
        day=synthetic_snapshot()
        day['model_version']='16-point-health-v2-macd-neutral-6-10'
        for key in ('sp500','nasdaq100'):
            day['markets'][key]['score']={'bearish':11,'available':16,'total':16,'regime':'RISK-OFF'}
        first=merge_daily_archive({},day)
        day['markets']['sp500']['score']={'bearish':10,'available':16,'total':16,'regime':'NEUTRAL'}
        day['markets']['nasdaq100']['score']={'bearish':10,'available':16,'total':16,'regime':'NEUTRAL'}
        fixed=merge_daily_archive({'market_insights_history':first},day)
        self.assertEqual(fixed,first)
        self.assertEqual(fixed['entries'][-1]['spy']['regime'],'RISK-OFF')

    def test_incomplete_same_session_can_improve_without_coverage_loss(self):
        day=synthetic_snapshot()
        day['markets']['sp500']['score']['available']=14
        first=merge_daily_archive({},day)
        self.assertEqual(first['entries'][-1]['spy']['regime'],'INCOMPLETE')
        day['markets']['sp500']['score']['available']=15
        day['markets']['sp500']['momentum']['state']='IMPROVING'
        fixed=merge_daily_archive({'market_insights_history':first},day)
        self.assertEqual(len(fixed['entries']),2)
        self.assertEqual(fixed['entries'][0],first['entries'][0])
        self.assertEqual(fixed['entries'][-1]['spy']['available'],15)
        self.assertEqual(fixed['entries'][-1]['spy']['trend_5d'],'IMPROVING')

    def test_same_session_coverage_tradeoff_is_rejected(self):
        day=synthetic_snapshot()
        day['markets']['sp500']['score']['available']=14
        first=merge_daily_archive({},day)
        day['markets']['sp500']['score']['available']=15
        day['markets']['nasdaq100']['score']['available']=14
        fixed=merge_daily_archive({'market_insights_history':first},day)
        self.assertEqual(fixed,first)

    def test_existing_day_is_never_rewritten_by_older_run(self):
        day=synthetic_snapshot()
        old=merge_daily_archive({},day)
        day['session']='2026-11-20'
        day['price_moves']['session']='2026-11-20'
        day['price_moves']['previous_session']='2026-11-19'
        day['moving_averages']['spy']['as_of']='2026-11-20'
        day['moving_averages']['qqq']['as_of']='2026-11-20'
        day['history']=[{'date':'2026-11-19','sp':9,'sp_available':15,'nd':9,'nd_available':15},
                        {'date':'2026-11-20','sp':10,'sp_available':15,'nd':11,'nd_available':15}]
        older=merge_daily_archive({'market_insights_history':old},day)
        self.assertEqual(older,old)

    def test_awaiting_close_preserves_existing_archive(self):
        day=synthetic_snapshot()
        archive=merge_daily_archive({},day)
        partial=copy.deepcopy(day)
        partial['price_moves']['status']='awaiting_close'
        self.assertEqual(merge_daily_archive({'market_insights_history':archive},partial),archive)

    def test_mismatched_price_session_not_saved(self):
        fresh=synthetic_snapshot()
        fresh['moving_averages']['spy']['as_of']='2026-11-20'
        self.assertIsNone(make_daily_entry(fresh))

    def test_inconsistent_prices_not_saved(self):
        fresh=synthetic_snapshot()
        fresh['price_moves']['spy']['close']=888.88
        self.assertIsNone(make_daily_entry(fresh))

    def test_score_regime_mismatch_fails_closed(self):
        fresh=synthetic_snapshot()
        fresh['markets']['sp500']['score']['regime']='RISK-ON'
        with self.assertRaises(ValueError):make_daily_entry(fresh)

    def test_incomplete_score_is_uncertain_not_false_alert(self):
        fresh=synthetic_snapshot()
        fresh['markets']['sp500']['score']={'bearish':10,'available':14,'total':15,'regime':'RISK-OFF'}
        row=make_daily_entry(fresh)
        self.assertEqual(row['spy']['regime'],'INCOMPLETE')
        self.assertEqual(row['spy']['price_risk_status'],'uncertain')
        self.assertIsNone(row['spy']['score_delta_1d'])

    def test_bad_old_archive_rejected_not_wiped(self):
        bad={'market_insights_history':{'version':1,'entries':[{'session':'not-a-date'}]}}
        with self.assertRaises(ValueError):merge_daily_archive(bad,synthetic_snapshot())

    def test_no_unmatched_signal_changes(self):
        fresh=synthetic_snapshot()
        fresh['signal_changes']['from_session']='2026-11-19'
        row=make_daily_entry(fresh)
        self.assertEqual(row['signal_changes']['status'],'unavailable')

    def test_both_markets_share_unified_neutral_band(self):
        fresh=synthetic_snapshot()
        fresh['markets']['sp500']['score']={'bearish':5,'available':15,'total':15,'regime':'NEUTRAL'}
        fresh['markets']['nasdaq100']['score']={'bearish':5,'available':15,'total':15,'regime':'NEUTRAL'}
        row=make_daily_entry(fresh)
        self.assertEqual(row['spy']['price_risk_status'],'watch')
        self.assertEqual(row['qqq']['price_risk_status'],'watch')


if __name__=='__main__': unittest.main()
