"""Synthetic, offline checks for EOD price-change publishing. Not a feed test."""
import sys
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from price_risk import build_price_moves

ET=ZoneInfo('America/New_York')


def closes():
    return pd.DataFrame({'SPY':[689.81,722.51],'QQQ':[608.45,651.03]},
                        index=pd.to_datetime(['2026-11-20','2026-11-23']))


class TestPriceRisk(unittest.TestCase):
    def test_mon_price_move_uses_actual_previous_equity_session(self):
        result=build_price_moves(closes(),'2026-11-23',now=datetime(2026,11,23,17,0,tzinfo=ET))
        self.assertEqual(result['status'],'complete')
        self.assertEqual(result['previous_session'],'2026-11-20')
        self.assertAlmostEqual(result['spy']['change_pct'],4.74,places=2)
        self.assertAlmostEqual(result['qqq']['change_pct'],7.0,places=2)

    def test_no_incomplete_same_day_bar_before_eod_cutoff(self):
        result=build_price_moves(closes(),'2026-11-23',now=datetime(2026,11,23,15,45,tzinfo=ET))
        self.assertEqual(result['status'],'awaiting_close')
        self.assertIsNone(result['spy'])

    def test_1614_is_awaiting_and_1615_can_publish(self):
        a=build_price_moves(closes(),'2026-11-23',now=datetime(2026,11,23,16,14,tzinfo=ET))
        b=build_price_moves(closes(),'2026-11-23',now=datetime(2026,11,23,16,15,tzinfo=ET))
        self.assertEqual(a['status'],'awaiting_close')
        self.assertEqual(b['status'],'complete')

    def test_early_close_uses_shared_1315_et_cutoff(self):
        data = pd.DataFrame({'SPY':[716.70,730.0],'QQQ':[633.93,650.0]},
                            index=pd.to_datetime(['2026-11-25','2026-11-27']))
        for hour,minute in [(12,59),(13,0),(13,14)]:
            with self.subTest(hour=hour,minute=minute):
                out=build_price_moves(data,'2026-11-27',now=datetime(2026,11,27,hour,minute,tzinfo=ET))
                self.assertEqual(out['status'],'awaiting_close')
                self.assertIsNone(out['spy'])
        for hour,minute in [(13,15),(13,20),(13,54)]:
            with self.subTest(hour=hour,minute=minute):
                out=build_price_moves(data,'2026-11-27',now=datetime(2026,11,27,hour,minute,tzinfo=ET))
                self.assertEqual(out['status'],'complete')
                self.assertEqual(out['previous_session'],'2026-11-25')
                self.assertAlmostEqual(out['spy']['change_pct'],(730/716.70-1)*100,places=4)
                self.assertEqual(out['qqq']['close'],650.0)

    def test_early_close_during_daylight_saving_time(self):
        data=pd.DataFrame({'SPY':[100,101],'QQQ':[200,202]},
                          index=pd.to_datetime(['2028-06-30','2028-07-03']))
        utc=ZoneInfo('UTC')
        self.assertEqual(build_price_moves(data,'2028-07-03',now=datetime(2028,7,3,17,14,tzinfo=utc))['status'],'awaiting_close')
        self.assertEqual(build_price_moves(data,'2028-07-03',now=datetime(2028,7,3,17,15,tzinfo=utc))['status'],'complete')

    def test_nontrading_or_future_target_rejected(self):
        for day,now in [('2026-11-26',datetime(2026,11,26,17,tzinfo=ET)),
                        ('2026-11-28',datetime(2026,11,28,17,tzinfo=ET)),
                        ('2026-11-27',datetime(2026,11,25,17,tzinfo=ET))]:
            with self.subTest(day=day):
                data=pd.DataFrame({'SPY':[100,101],'QQQ':[200,202]},index=pd.to_datetime(['2026-11-24',day]))
                self.assertEqual(build_price_moves(data,day,now=now)['status'],'unavailable')

    def test_missing_close_on_early_session_still_blocks(self):
        data=pd.DataFrame({'SPY':[100,101],'QQQ':[200,float('nan')]},
                          index=pd.to_datetime(['2026-11-25','2026-11-27']))
        self.assertEqual(build_price_moves(data,'2026-11-27',now=datetime(2026,11,27,13,54,tzinfo=ET))['status'],'unavailable')

    def test_missing_session_never_falls_back_to_wrong_day(self):
        self.assertEqual(build_price_moves(closes(),'2026-11-24',now=datetime(2026,11,24,18,tzinfo=ET))['status'],'unavailable')

    def test_missing_close_never_imputes(self):
        data=closes();data.loc[pd.Timestamp('2026-11-23'),'SPY']=float('nan')
        self.assertEqual(build_price_moves(data,'2026-11-23',now=datetime(2026,11,23,18,tzinfo=ET))['status'],'unavailable')

    def test_previous_date_is_shared_equity_bar_not_sunday_futures_bar(self):
        data=closes();data.loc[pd.Timestamp('2026-11-22')]=[float('nan'),float('nan')]
        self.assertEqual(build_price_moves(data,'2026-11-23',now=datetime(2026,11,23,18,tzinfo=ET))['previous_session'],'2026-11-20')

    def test_invalid_price_does_not_fake_a_percent(self):
        data=closes();data.loc[pd.Timestamp('2026-11-20'),'SPY']=0
        self.assertEqual(build_price_moves(data,'2026-11-23',now=datetime(2026,11,23,18,tzinfo=ET))['status'],'unavailable')

    def test_older_session_can_publish_without_today_date(self):
        out=build_price_moves(closes(),'2026-11-23',now=datetime(2026,11,24,10,tzinfo=ET))
        self.assertEqual(out['status'],'complete')

    def test_naive_now_does_not_guess_timezone(self):
        self.assertEqual(build_price_moves(closes(),'2026-11-23',now=datetime(2026,11,23,18))['status'],'unavailable')

if __name__=='__main__':unittest.main()
