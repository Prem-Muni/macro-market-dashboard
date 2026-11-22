import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from engine import score_of, score_of_legacy14, signal, SHARED, SP, ND

class ThresholdPolicyTests(unittest.TestCase):
    def make(self,keys,bearish):
        return {key:signal('bear' if i<bearish else 'bull') for i,key in enumerate(keys)}
    def test_qqq_five_risk_on_spy_five_caution(self):
        spy=self.make(SHARED+SP,5)
        qqq=self.make(SHARED+ND,5)
        self.assertEqual(score_of(spy,SHARED+SP)['regime'],'CAUTION')
        self.assertEqual(score_of(qqq,SHARED+ND,risk_on_max=5)['regime'],'RISK-ON')
    def test_threshold_edges(self):
        for market,keys,cap in [('SPY',SHARED+SP,4),('QQQ',SHARED+ND,5)]:
            for score,regime in [(0,'RISK-ON'),(4,'RISK-ON'),(5,'RISK-ON' if cap==5 else 'CAUTION'),(6,'CAUTION'),(8,'CAUTION'),(9,'RISK-OFF'),(15,'RISK-OFF')]:
                self.assertEqual(score_of(self.make(keys,score),keys,risk_on_max=cap)['regime'],regime,(market,score))
    def test_partial_boundary_never_guessed(self):
        keys=SHARED+ND
        qqq=self.make(keys,5);qqq[keys[6]]=signal('na')
        self.assertEqual(score_of(qqq,keys,risk_on_max=5)['regime'],'INCOMPLETE')
        spy=self.make(SHARED+SP,4);spy[(SHARED+SP)[6]]=signal('na')
        self.assertEqual(score_of(spy,SHARED+SP)['regime'],'INCOMPLETE')
    def test_legacy14_unchanged(self):
        keys=(SHARED+ND)[:-1]
        out=score_of_legacy14(self.make(keys,5),keys)
        self.assertEqual(out['regime'],'CAUTION')

if __name__=='__main__': unittest.main()
