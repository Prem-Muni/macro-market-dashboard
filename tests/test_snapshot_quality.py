"""Run from the repository root where the existing dashboard modules are present."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from update import is_same_session_quality_regression

class SnapshotTests(unittest.TestCase):
    def snap(self, date='2026-11-24', model='16-point', spy=16, qqq=16):
        return {'session':date,'model_version':model,
                'markets':{'sp500':{'score':{'available':spy}},
                           'nasdaq100':{'score':{'available':qqq}}}}
    def test_rejects_worse_same_day_same_model(self):
        self.assertTrue(is_same_session_quality_regression(self.snap(),self.snap(qqq=15)))
    def test_accepts_more_complete_same_day(self):
        self.assertFalse(is_same_session_quality_regression(self.snap(spy=15,qqq=15),self.snap()))
    def test_allows_next_session_partial(self):
        self.assertFalse(is_same_session_quality_regression(self.snap(),self.snap(date='2026-11-25',qqq=15)))
    def test_allows_model_transition(self):
        self.assertFalse(is_same_session_quality_regression(self.snap(),self.snap(model='17-point',qqq=15)))
    def test_handles_missing_old_fields(self):
        self.assertFalse(is_same_session_quality_regression({'session':'2026-11-24','model_version':'16-point'},self.snap(qqq=15)))
if __name__=='__main__':unittest.main()
