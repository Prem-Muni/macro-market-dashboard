import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import pandas as pd
from engine import analyze,score_of,signal,SP,SHARED,ND

class EngineTests(unittest.TestCase):
    def make(self,extra=False):
        days=pd.bdate_range('2024-08-01',periods=360)
        import numpy as np
        x=np.arange(len(days))
        # Synthetic, never used as live prices.
        d={'SPY':450+x*.3,'QQQ':400+x*.4,'RSP':160+x*.1,'QQQE':100+x*.11,'IWM':200+x*.12,'SMH':230+x*.22,
           'XLE':90+x*.03,'XLP':75+x*.02,'XLV':130+x*.02,'XLU':65+x*.02,'HYG':75+x*.015,'IEF':90+x*.01,
           'OIL':70+x*.005,'COPPER':4+x*.001,'USD':100+x*.003,'TNX':4+x*.0008,'VIX':19+(x%5)*.1,'VXN':24+(x%5)*.15,'VIX3M':22+(x%5)*.08}
        frame=pd.DataFrame(d,index=days)
        suppl=None
        if extra:
            suppl=pd.DataFrame({'SPX_BREADTH200':60-x*.025,'NDX_ADV':[55]*len(days),'NDX_DECL':[45]*len(days)},index=days)
        return frame,suppl
    def test_missing_data_never_counted_bullish(self):
        price,_=self.make()
        result=analyze(price)
        sp=result['markets']['sp500']['score'];nd=result['markets']['nasdaq100']['score']
        self.assertEqual(sp['total'],14); self.assertEqual(nd['total'],14)
        self.assertEqual(sp['available'],13)
        self.assertEqual(nd['available'],13)
        self.assertFalse(any('pc' in k.lower() for k in result['signals']))
        self.assertEqual(result['signals']['sp_breadth1d']['state'],'na')
        self.assertEqual(result['signals']['nd_breadth1d']['state'],'na')
        self.assertEqual(sp['possible_max']-sp['bearish'],1)
        self.assertEqual(result['markets']['sp500']['swing'],'N/A')
    def test_all_data_and_14_signal_counts(self):
        price,extra=self.make(True)
        result=analyze(price,extra)
        for market in ('sp500','nasdaq100'):
            self.assertEqual(result['markets'][market]['score']['available'],14)
            self.assertEqual(result['markets'][market]['score']['total'],14)
            self.assertIn(result['markets'][market]['swing'],['BULLISH','BEARISH','EARLY IMPROVEMENT','DETERIORATING','SELECTIVE'])
        self.assertIn(result['signals']['sp_breadth5d']['state'],('bear','bull','warn'))
    def test_removed_put_call_fields_not_published_or_scored(self):
        price,extra=self.make(True)
        baseline=analyze(price,extra)
        # Even if an old supplemental file contains these unused columns,
        # the current engine must neither display nor score them.
        legacy=extra.copy()
        legacy['SPX_PCR']=1.481
        legacy['NDX_PCR']=1.144
        old=analyze(price,legacy)
        self.assertEqual(old['markets'],baseline['markets'])
        self.assertEqual(old['history'],baseline['history'])
        self.assertFalse(any('pc' in k.lower() for k in old['signals']))
        self.assertFalse(any('pc' in k.lower() for k in old['names']))
        self.assertFalse(any('pc' in k.lower() for section in old['order'].values() for k in section))
        self.assertEqual(old['markets']['sp500']['score']['total'],14)
        self.assertEqual(old['markets']['nasdaq100']['score']['total'],14)

    def test_risk_bounds(self):
        keys=SHARED+SP
        signals={key:signal('bull') for key in keys}
        for key in SHARED: signals[key]=signal('bear')
        signals['vix']=signal('na')
        signals['sp_breadth1d']=signal('na')
        score=score_of(signals,keys)
        self.assertEqual(score['regime'],'INCOMPLETE')
        self.assertEqual(score['possible_max'],8)
        self.assertEqual(score['total'],14)
    def test_directory_risks_are_normalized(self):
        price,extra=self.make(True)
        # Same direction oil and SPY up -> bearish divergence
        res=analyze(price,extra)
        self.assertEqual(res['signals']['oil']['label'],'BEARISH DIV')
        self.assertEqual(res['signals']['vix_curve']['state'],'bull')
    def test_momentum_mask_stable(self):
        price,extra=self.make(True)
        res=analyze(price,extra)
        self.assertIsNotNone(res['markets']['sp500']['momentum']['d5'])
        self.assertEqual(len(res['history']),90)

if __name__=='__main__':unittest.main()

# Additional regression cases for conservative score-range decisions.
class PartialDataDecisionTests(unittest.TestCase):
    def test_uncertain_vs_certain_momentum(self):
        from engine import score_momentum_bounds
        before={'bearish':6,'possible_max':7}
        now={'bearish':10,'possible_max':11}
        r=score_momentum_bounds(now,before)
        self.assertEqual(r['min'],3)
        self.assertEqual(r['max'],5)
        self.assertEqual(r['state'],'DETERIORATING')
        r=score_momentum_bounds({'bearish':10,'possible_max':11},
                                 {'bearish':9,'possible_max':10})
        self.assertEqual(r['state'],'UNCERTAIN')

    def test_high_bearish_incomplete_still_classified_bearish(self):
        from engine import swing_from_bounds
        now={'bearish':10,'possible_max':11}
        prev={'bearish':6,'possible_max':7}
        conf={'confirmed':0,'available':4,'total':4}
        self.assertEqual(swing_from_bounds(now,prev,conf,'bear'),'BEARISH')

    def test_early_improvement_uncertain_is_not_claimed(self):
        from engine import swing_from_bounds
        now={'bearish':9,'possible_max':10}
        prev={'bearish':10,'possible_max':11}
        conf={'confirmed':3,'available':4,'total':4}
        # Some feasible inputs are improving enough and others are not.
        self.assertEqual(swing_from_bounds(now,prev,conf,'bear'),'N/A')

    def test_full_data_rule_unchanged(self):
        from engine import swing_from_bounds
        good={'bearish':3,'possible_max':3}
        prev={'bearish':3,'possible_max':3}
        conf={'confirmed':4,'available':4,'total':4}
        self.assertEqual(swing_from_bounds(good,prev,conf,'bull'),'BULLISH')
