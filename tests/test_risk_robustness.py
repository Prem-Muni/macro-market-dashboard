"""Synthetic forward-return and split checks; never tests real-market outcomes."""
from pathlib import Path
import sys
import unittest
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from engine import historical_backtest

class QqqRiskRobustnessTests(unittest.TestCase):
    @staticmethod
    def rec(day, score, complete=True):
        def market(n):
            return {'bearish': n, 'complete': complete, 'available': 15 if complete else 14}
        return {'date': pd.Timestamp(day).strftime('%Y-%m-%d'), 'sp': market(4), 'nd': market(score)}

    def test_median_std_downside_and_nonoverlap_are_exact(self):
        dates = pd.bdate_range('2026-05-04', periods=14)
        closes = [100,90,95,95,98,100,102,105,108,109,115,113,117,114]
        frame = pd.DataFrame({'QQQ': closes, 'SPY': [100]*14},index=dates)
        # Qualifying score=5 on days 0, 1, 3 (overlapping windows).
        scores = [5,5,7,5]+[7]*10
        result = historical_backtest([self.rec(d,v) for d,v in zip(dates,scores)],frame,dates[-1])['year']['qqq_risk']['groups']['exactly_five']
        returns = [(100/100-1)*100,(102/90-1)*100,(108/95-1)*100]
        import statistics
        self.assertEqual(result['days'],3)
        self.assertEqual(result['forward5_observations'],3)
        self.assertAlmostEqual(result['forward5_median_pct'],round(statistics.median(returns),3))
        self.assertAlmostEqual(result['forward5_stddev_pct'],round(statistics.stdev(returns),3))
        self.assertAlmostEqual(result['forward5_worst_pct'],0.0)
        self.assertEqual(result['forward5_worst_close_pct'],-10.0)
        self.assertEqual(result['nonoverlap_observations'],1)
        self.assertAlmostEqual(result['nonoverlap_mean_pct'],0.0)

    def test_grouping_uses_prior_score_only_and_requires_15_of_15(self):
        dates = pd.bdate_range('2026-05-04', periods=19)
        frame = pd.DataFrame({'QQQ':[100+i for i in range(19)], 'SPY':[100+i for i in range(19)]},index=dates)
        scores=[8,8,8,8,8,8,8,8,8,8,5,5,5,5,5,5,5,7,8]
        records=[self.rec(d,score,complete=(i != 11)) for i,(d,score) in enumerate(zip(dates,scores))]
        groups=historical_backtest(records,frame,dates[-1])['year']['qqq_risk']['groups']
        self.assertEqual(groups['exactly_five']['days'],6)
        self.assertEqual(groups['five_improving']['days'],4) # i10,12,13,14 have prior score 8
        self.assertEqual(groups['selective']['days'],4)
        self.assertEqual(groups['five_stable']['days'],1) # i15 vs complete score 5 at i10
        # i16 has an incomplete prior score (i11), so is left unclassified.
        self.assertEqual(groups['exactly_five']['days'] - groups['five_improving']['days'] - groups['five_stable']['days'], 1)

    def test_future_pending_does_not_create_return_distribution(self):
        dates=pd.bdate_range('2026-11-16', periods=6)
        frame=pd.DataFrame({'QQQ':[100,99,98,97,96,95],'SPY':[100]*6},index=dates)
        records=[self.rec(d,5) for d in dates]
        g=historical_backtest(records,frame,dates[-1])['year']['qqq_risk']['groups']['exactly_five']
        self.assertEqual(g['forward5_observations'],1)
        self.assertEqual(g['forward5_stddev_pct'],None)
        self.assertEqual(g['forward5_median_pct'],-5)

    def test_calendar_halves_and_score_membership_are_mutually_exclusive(self):
        dates=pd.bdate_range('2025-03-20','2026-11-20')
        frame=pd.DataFrame({'QQQ':[100+i*.1 for i in range(len(dates))],
                            'SPY':[200+i*.1 for i in range(len(dates))]},index=dates)
        scores=[5 if i%3==0 else 4 for i in range(len(dates))]
        res=historical_backtest([self.rec(d,s) for d,s in zip(dates,scores)],frame,dates[-1])['twenty_months']
        halves=res['qqq_risk']['halves']
        self.assertEqual(len(halves),2)
        self.assertEqual(sum(h['sessions'] for h in halves),res['sessions'])
        self.assertEqual(sum(h['groups']['exactly_five']['days'] for h in halves),res['qqq_risk']['groups']['exactly_five']['days'])
        self.assertTrue(halves[0]['end'] < halves[1]['start'])

if __name__=='__main__':unittest.main()
