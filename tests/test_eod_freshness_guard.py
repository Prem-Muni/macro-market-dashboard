import sys, unittest
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from eod_freshness import check_snapshot_session, expected_close, is_regular_session
CT=ZoneInfo('America/Chicago')
class TestEodFreshness(unittest.TestCase):
 def test_trading_day_cutoff(self):
  self.assertIsNone(expected_close(datetime(2026,11,24,15,14,tzinfo=CT)))
  self.assertEqual(str(expected_close(datetime(2026,11,24,15,15,tzinfo=CT))),'2026-11-24')
 def test_stale_data_fails_after_close(self):
  with self.assertRaisesRegex(RuntimeError,'NOT READY'):
   check_snapshot_session('2026-11-23','2026-11-23',datetime(2026,11,24,16,20,tzinfo=CT))
 def test_cannot_regress_even_before_close(self):
  with self.assertRaisesRegex(RuntimeError,'REGRESSION'):
   check_snapshot_session('2026-11-23','2026-11-24',datetime(2026,11,25,9,0,tzinfo=CT))
 def test_same_day_good(self):
  check_snapshot_session('2026-11-24','2026-11-23',datetime(2026,11,24,19,15,tzinfo=CT))
 def test_holiday_no_false_failure(self):
  self.assertFalse(is_regular_session(datetime(2026,11,26,tzinfo=CT).date()))
  check_snapshot_session('2026-11-25','2026-11-25',datetime(2026,11,26,19,15,tzinfo=CT))
 def test_weekend_no_false_failure(self):
  check_snapshot_session('2026-11-27','2026-11-27',datetime(2026,11,28,19,15,tzinfo=CT))
 def test_new_year_sat_not_false_closed_on_friday(self):
  self.assertTrue(is_regular_session(datetime(2021,12,31,tzinfo=CT).date()))
if __name__ == '__main__': unittest.main()
