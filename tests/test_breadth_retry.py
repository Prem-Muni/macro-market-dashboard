"""Offline regression tests for the no-key same-session breadth repair."""
import sys
import unittest
from pathlib import Path
from unittest import mock
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import breadth


class RecentBreadthRetryTests(unittest.TestCase):
    def setUp(self):
        self.days = pd.bdate_range('2025-01-02', periods=260)
        self.last = self.days[-1]
        self.sp = [f'SP{i}' for i in range(20)]
        self.nd = [f'ND{i}' for i in range(10)]
        self.members = {'SP500': self.sp, 'NDX100': self.nd}
        self.all = self.sp + self.nd
        self.full = {s: pd.Series(100 + n + pd.Series(range(len(self.days)),dtype=float).values / 10,
                                  index=self.days) for n,s in enumerate(self.all)}

    def frame(self, requested, *, altered=None, future=False):
        altered = altered or {}
        frames = {}
        for sym in requested:
            ser=self.full[sym].iloc[-26:].copy()
            if sym in altered:
                ser.iloc[-2] *= altered[sym]
            if future:
                ser.loc[self.last + pd.Timedelta(days=1)] = 99999
            frames[sym] = pd.DataFrame({'Close':ser})
        return pd.concat(frames,axis=1)

    def test_recovery_restores_missing_scored_breadth(self):
        closes = {s: x.iloc[:-1].copy() for s,x in self.full.items()}
        before,cov,_ = breadth.calculate_breadth(self.days,self.members,closes)
        self.assertTrue(pd.isna(before.at[self.last,'SPX_BREADTH200']))
        self.assertTrue(pd.isna(before.at[self.last,'NDX_ADV']))
        queried=[]
        def downloader(*,tickers,**kw):
            queried.extend(tickers)
            self.assertEqual(kw['auto_adjust'],True)
            self.assertEqual(kw['interval'],'1d')
            self.assertEqual(kw['end'], (self.last+pd.Timedelta(days=1)).date().isoformat())
            return self.frame(tickers)
        fixed,notes=breadth.repair_recent_constituent_bars(self.days,self.members,closes,downloader=downloader)
        after,cov,_=breadth.calculate_breadth(self.days,self.members,fixed)
        self.assertEqual(len(queried),30)
        self.assertTrue(pd.notna(after.at[self.last,'SPX_BREADTH200']))
        self.assertTrue(pd.notna(after.at[self.last,'NDX_ADV']))
        self.assertEqual(cov,{'SP500':100.0,'NDX100':100.0})
        self.assertTrue(any('30 newly verified' in x for x in notes))

    def test_unchanged_does_not_call_provider(self):
        called=[]
        _,notes=breadth.repair_recent_constituent_bars(self.days,self.members,self.full.copy(),
            downloader=lambda **kw: called.append(True))
        self.assertEqual(called,[])
        self.assertIn('no missing', notes[0])

    def test_disagreeing_overlap_is_rejected(self):
        closes={s: ser.iloc[:-1].copy() for s,ser in self.full.items()}
        bad=self.sp[0]
        fixed,notes=breadth.repair_recent_constituent_bars(self.days,self.members,closes,
            downloader=lambda **kw:self.frame(kw['tickers'],altered={bad:1.20}))
        self.assertNotIn(self.last,fixed[bad].index)
        self.assertIn(self.last,fixed[self.sp[1]].index)
        self.assertTrue(any('1 overlap rejections' in x for x in notes))

    def test_does_not_import_future_bar(self):
        closes={s: ser.iloc[:-1].copy() for s,ser in self.full.items()}
        fixed,_=breadth.repair_recent_constituent_bars(self.days,self.members,closes,
            downloader=lambda **kw:self.frame(kw['tickers'],future=True))
        for ser in fixed.values():
            self.assertNotIn(self.last+pd.Timedelta(days=1),ser.index)

    def test_no_short_repair_for_unusable_history(self):
        closes={s: ser.iloc[-20:-1].copy() for s,ser in self.full.items()}
        called=[]
        fixed,_=breadth.repair_recent_constituent_bars(self.days,self.members,closes,
            downloader=lambda **kw:called.append(True))
        self.assertEqual(called,[])
        self.assertTrue(all(len(x)<200 for x in fixed.values()))

    def test_empty_batch_never_fills(self):
        closes={s: ser.iloc[:-1].copy() for s,ser in self.full.items()}
        fixed,notes=breadth.repair_recent_constituent_bars(self.days,self.members,closes,
            downloader=lambda **kw:pd.DataFrame())
        self.assertTrue(all(self.last not in ser.index for ser in fixed.values()))
        self.assertTrue(any('0 newly verified' in x for x in notes))

    def test_provider_exception_preserves_original(self):
        closes={s: ser.iloc[:-1].copy() for s,ser in self.full.items()}
        def fail(**kw):raise ConnectionError('rate limited')
        fixed,notes=breadth.repair_recent_constituent_bars(self.days,self.members,closes,downloader=fail)
        self.assertTrue(all(self.last not in ser.index for ser in fixed.values()))
        self.assertTrue(any('failed' in x for x in notes))

    def test_no_relaxation_of_coverage_threshold(self):
        self.assertEqual(breadth.REQUIRED_COVERAGE,0.95)

    def test_derive_breadth_recalculates_after_retry(self):
        closes={s: ser.iloc[:-1].copy() for s,ser in self.full.items()}
        def fixed_repair(*args,**kwargs):
            for s in self.all:
                closes[s]=self.full[s]
            return closes, ['Breadth short retry synthetic test']
        with mock.patch.object(breadth,'load_membership',return_value=self.members), \
             mock.patch.object(breadth,'acquire_closes',return_value=(closes,[])), \
             mock.patch.object(breadth,'repair_recent_constituent_bars',side_effect=fixed_repair) as repair:
            frame,coverage,notes=breadth.derive_breadth(self.days)
        self.assertEqual(repair.call_count,1)
        self.assertTrue(pd.notna(frame.at[self.last,'SPX_BREADTH200']))
        self.assertTrue(pd.notna(frame.at[self.last,'NDX_ADV']))
        self.assertTrue(any('100.0%' in line for line in notes))

    def test_membership_failure_is_graceful(self):
        with mock.patch.object(breadth,'load_membership',side_effect=ValueError('blocked')):
            frame,coverage,notes=breadth.derive_breadth(self.days)
        self.assertIsNone(frame)
        self.assertEqual(coverage,{})
        self.assertTrue(any('membership unavailable' in x for x in notes))

if __name__=='__main__':unittest.main()
