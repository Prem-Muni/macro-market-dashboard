"""Tests for the user-approved, screenshot-derived Friday EOD baseline."""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from friday_baseline import friday_baseline_entry
from insights_history import merge_daily_archive


def monday():
    return {
        'session': '2026-11-23',
        'price_moves': {
            'session': '2026-11-23', 'previous_session': '2026-11-20', 'status': 'complete',
            'spy': {'previous_close':689.81, 'close':722.29,'change_pct':round((722.29 / 689.81 - 1) * 100, 5)},
            'qqq': {'previous_close':608.45, 'close':651.03,'change_pct':round((651.03 / 608.45 - 1) * 100, 5)},
        },
        'moving_averages': {'spy':{'as_of':'2026-11-23','close':722.29}, 'qqq':{'as_of':'2026-11-23','close':651.03}},
        'markets': {
            'sp500': {'score': {'bearish':10,'available':15,'total':15,'regime':'RISK-OFF'},
                'momentum':{'state':'STABLE','d5_range':[1,1]},
                'confirmation': {'confirmed':0,'available':4,'total':4}, 'swing':'BEARISH'},
            'nasdaq100': {'score': {'bearish':11,'available':15,'total':15,'regime':'RISK-OFF'},
                'momentum':{'state':'DETERIORATING','d5_range':[2,2]},
                'confirmation': {'confirmed':0,'available':4,'total':4}, 'swing':'BEARISH'},
        },
        'signals': {'sp_breadth1d':{'source':'EXPERIMENTAL constituent estimate'}, 'nd_breadth1d':{'source':'EXPERIMENTAL constituent estimate'}},
        'history': [
            {'date':'2026-11-20','sp':11,'sp_available':15,'nd':11,'nd_available':15},
            {'date':'2026-11-23','sp':10,'sp_available':15,'nd':11,'nd_available':15},
        ],
        'signal_changes': {'from_session':'2026-11-20','to_session':'2026-11-23',
            'groups': {'shared':{'new_bearish':[],'eased':[],'other':[]},
                       'sp':{'new_bearish':[],'eased':[],'other':[]},
                       'nd':{'new_bearish':[],'eased':[],'other':[]}}},
    }


class ScreenshotBaselineTests(unittest.TestCase):
    def test_friday_values_are_from_saved_screenshots(self):
        row=friday_baseline_entry()
        self.assertEqual(row['session'],'2026-11-20')
        self.assertTrue(row['baseline'])
        self.assertEqual((row['spy']['close'],row['qqq']['close']), (689.81,608.45))
        self.assertEqual((row['spy']['score'],row['qqq']['score']), (11,11))
        self.assertEqual((row['spy']['previous_score'],row['qqq']['previous_score']), (12,10))
        self.assertEqual((row['spy']['trend_5d'],row['qqq']['trend_5d']), ('DETERIORATING','STABLE'))
        self.assertEqual((row['spy']['baseline_context']['rsi14'],row['qqq']['baseline_context']['rsi14']), (24.91,26.63))
        self.assertEqual((row['spy']['baseline_context']['volatility_index']['value'],row['qqq']['baseline_context']['volatility_index']['value']), (35.89,45.25))

    def test_unknown_thursday_prices_and_alert_are_not_invented(self):
        row=friday_baseline_entry()
        for sym in ('spy','qqq'):
            self.assertIsNone(row[sym]['previous_close'])
            self.assertIsNone(row[sym]['price_change_pct'])
            self.assertEqual(row[sym]['price_risk_status'],'uncertain')
        self.assertEqual(row['signal_changes']['status'],'partial')
        self.assertIn('collapsed',row['signal_changes']['note'])

    def test_initial_history_starts_friday_and_includes_monday(self):
        out=merge_daily_archive({},monday())
        self.assertEqual([e['session'] for e in out['entries']], ['2026-11-20','2026-11-23'])
        self.assertEqual(out['entries'][1]['spy']['score_delta_1d'],-1)
        self.assertEqual(out['entries'][1]['qqq']['price_risk_status'],'divergence')

    def test_insert_friday_before_preexisting_monday_without_editing_monday(self):
        existing=merge_daily_archive({},monday())['entries'][1]
        current={'market_insights_history':{'version':1,'entries':[copy.deepcopy(existing)]}}
        new=merge_daily_archive(current,monday())
        self.assertEqual([e['session'] for e in new['entries']],['2026-11-20','2026-11-23'])
        self.assertEqual(new['entries'][1]['qqq'],existing['qqq'])

    def test_no_duplicate_on_repeat_run(self):
        first=merge_daily_archive({},monday())
        second=merge_daily_archive({'market_insights_history':first},monday())
        self.assertEqual(len(second['entries']),2)
        self.assertEqual(sum(e['session']=='2026-11-20' for e in second['entries']),1)

    def test_existing_real_friday_record_is_not_overwritten(self):
        own=friday_baseline_entry()
        own.pop('baseline')
        own['record_source']='verified_daily_capture'
        own['spy']['previous_close']=682.0
        saved={'market_insights_history':{'version':1,'entries':[own]}}
        output=merge_daily_archive(saved,monday())
        self.assertEqual(output['entries'][0]['record_source'],'verified_daily_capture')
        self.assertEqual(output['entries'][0]['spy']['previous_close'],682.0)

    def test_only_once_even_if_other_past_days_are_saved(self):
        existing=merge_daily_archive({},monday())['entries'][1]
        older=copy.deepcopy(friday_baseline_entry())
        older['session']='2026-11-19'; older['previous_session']='2026-11-18';older['baseline']=False
        saved={'market_insights_history':{'version':1,'entries':[older,existing]}}
        updated=merge_daily_archive(saved,monday())
        self.assertEqual([e['session'] for e in updated['entries']],['2026-11-19','2026-11-20','2026-11-23'])

    def test_missing_new_price_does_not_prevent_friday_seed(self):
        data=monday()
        data['price_moves']['status']='awaiting_close'
        out=merge_daily_archive({},data)
        self.assertEqual([e['session'] for e in out['entries']], ['2026-11-20'])

    def test_baseline_function_provides_independent_copies(self):
        a=friday_baseline_entry();a['spy']['score']=0
        self.assertEqual(friday_baseline_entry()['spy']['score'],11)

    def test_corrupt_archive_remains_rejected(self):
        with self.assertRaises(ValueError):
            merge_daily_archive({'market_insights_history':{'version':1,'entries':[{'session':'bad'}]}},monday())

if __name__=='__main__': unittest.main()
