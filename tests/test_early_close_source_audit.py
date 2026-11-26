import sys, unittest
from pathlib import Path
from datetime import datetime, date
from zoneinfo import ZoneInfo
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"scripts"))
from eod_freshness import expected_close, most_recent_completed_session, is_early_close
from source_audit import build_source_audit
CT=ZoneInfo("America/Chicago")
class EarlyCloseAuditTests(unittest.TestCase):
    def test_short_days(self):
        for y,m,d in [(2026,11,27),(2026,12,24),(2027,11,26),(2028,7,3),(2028,11,24)]:
            self.assertTrue(is_early_close(date(y,m,d)))
            self.assertIsNone(expected_close(datetime(y,m,d,12,14,tzinfo=CT)))
            self.assertEqual(expected_close(datetime(y,m,d,12,15,tzinfo=CT)),date(y,m,d))
    def test_normal_holiday_weekend(self):
        self.assertIsNone(expected_close(datetime(2026,11,25,12,20,tzinfo=CT)))
        self.assertIsNone(expected_close(datetime(2026,11,26,19,20,tzinfo=CT)))
        self.assertIsNone(expected_close(datetime(2026,11,28,19,20,tzinfo=CT)))
        self.assertEqual(most_recent_completed_session(datetime(2026,11,27,12,20,tzinfo=CT)),date(2026,11,27))
        self.assertEqual(most_recent_completed_session(datetime(2026,11,27,12,14,tzinfo=CT)),date(2026,11,25))
        self.assertEqual(expected_close(datetime(2027,12,31,15,20,tzinfo=CT)),date(2027,12,31))
    def test_source_dates_and_fallback(self):
        ix=pd.to_datetime(["2026-11-25","2026-11-27"])
        df=pd.DataFrame({"COPPER":[4.,4.2],"OIL":[70.,float("nan")],"VIX":[20.,21.],"VXN":[25.,26.]},index=ix)
        raw={k:df[k] for k in df}
        raw["COPPER"]=pd.Series([4.,4.2,4.1],index=pd.to_datetime(["2026-11-25","2026-11-27","2026-11-30"]))
        a=build_source_audit(df,None,raw,{k:"provider" for k in df},{"VIX":df.VIX,"VXN":df.VXN.iloc[:1]},"2026-11-27")["observations"]
        self.assertEqual(a["COPPER"]["latest_vendor_session"],"2026-11-30")
        self.assertEqual(a["COPPER"]["observation_session"],"2026-11-27")
        self.assertAlmostEqual(a["COPPER"]["daily_change"],.2)
        self.assertFalse(a["COPPER"]["settlement_verified"])
        self.assertEqual(a["OIL"]["status"],"missing_for_session")
        self.assertIsNone(a["OIL"]["daily_change"])
        self.assertEqual(a["VIX"]["provider"],"Cboe official historical CSV")
        self.assertEqual(a["VXN"]["provider"],"Yahoo fallback (unofficial)")
    def test_bad_session_rejected(self):
        with self.assertRaises(ValueError):
            build_source_audit(pd.DataFrame(),None,{},{},{},"2026-11-27")
if __name__=="__main__": unittest.main()
