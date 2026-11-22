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
            suppl=pd.DataFrame({'SPX_PCR':[.93]*len(days),'NDX_PCR':[.95]*len(days),
                'SPX_BREADTH200':60-x*.025,'NDX_ADV':[55]*len(days),'NDX_DECL':[45]*len(days)},index=days)
        return frame,suppl
    def test_missing_data_never_counted_bullish(self):
        price,_=self.make()
        result=analyze(price)
        sp=result['markets']['sp500']['score'];nd=result['markets']['nasdaq100']['score']
        self.assertEqual(sp['total'],15); self.assertEqual(nd['total'],15)
        self.assertEqual(sp['available'],13)
        self.assertEqual(nd['available'],13)
        self.assertEqual(result['signals']['spx_pc']['state'],'na')
        self.assertEqual(result['signals']['sp_breadth1d']['state'],'na')
        self.assertEqual(result['signals']['nd_breadth1d']['state'],'na')
        self.assertEqual(sp['possible_max']-sp['bearish'],2)
        self.assertEqual(result['markets']['sp500']['swing'],'N/A')
    def test_all_data_and_15_signal_counts(self):
        price,extra=self.make(True)
        result=analyze(price,extra)
        for market in ('sp500','nasdaq100'):
            self.assertEqual(result['markets'][market]['score']['available'],15)
            self.assertEqual(result['markets'][market]['score']['total'],15)
            self.assertIn(result['markets'][market]['swing'],['BULLISH','BEARISH','EARLY IMPROVEMENT','DETERIORATING','SELECTIVE'])
        self.assertIn(result['signals']['sp_breadth5d']['state'],('bear','bull','warn'))
    def test_bearish_washout_scores_one(self):
        signals={key:signal('bull') for key in (SHARED+SP)}
        signals['spx_pc']=signal('wash','WASHOUT?')
        score=score_of(signals,SHARED+SP)
        self.assertEqual(score['bearish'],1)
    def test_risk_bounds(self):
        signals={key:signal('bull') for key in SHARED+SP}
        for key in (SHARED+SP)[:6]:signals[key]=signal('bear')
        signals['spx_pc']=signal('na')
        signals['sp_breadth1d']=signal('na')
        score=score_of(signals,SHARED+SP)
        self.assertEqual(score['regime'],'INCOMPLETE')
        self.assertEqual(score['possible_max'],8)
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
