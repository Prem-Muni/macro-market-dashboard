import unittest,sys, pathlib
import pandas as pd
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
from validation_20w import evaluate

class Validation20Weeks(unittest.TestCase):
 def setUp(self):
  days=pd.bdate_range('2026-07-06',periods=103)
  self.days=days
  self.frame=pd.DataFrame({'SPY':[100+i for i in range(len(days))],'QQQ':[200+2*i for i in range(len(days))]},index=days)
  self.rows=[{'date':d.strftime('%Y-%m-%d'), 'sp':{'health':12 if i%3==0 else 8 if i%3==1 else 4,'total':16,'available':16,'complete':True}, 'nd':{'health':11 if i%3==0 else 6 if i%3==1 else 2,'total':16,'available':16,'complete':True}} for i,d in enumerate(days)]
 def test_three_regimes(self):
  data=evaluate(self.rows,self.frame,self.days[-1]);self.assertEqual(set(data['markets']['sp']['regimes']),{'RISK-ON','RISK-OFF','NEUTRAL'})
 def test_positive_forward_bull(self):
  data=evaluate(self.rows,self.frame,self.days[-1]); bull=data['markets']['sp']['regimes']['RISK-ON']['horizons']['5'];self.assertEqual(bull['positive_pct'],100);self.assertGreater(bull['nonoverlap_n'],0)
 def test_excludes_incomplete(self):
  self.rows[5]['sp']['available']=15;self.rows[5]['sp']['complete']=False
  data=evaluate(self.rows,self.frame,self.days[-1]);self.assertEqual(data['markets']['sp']['incomplete_or_missing_sessions'],1)
 def test_does_not_use_future_bars_after_end(self):
  old_end=self.days[-12]
  d=evaluate(self.rows,self.frame,old_end)
  for h in (1,5,10):
   self.assertLess(d['markets']['sp']['all_eligible']['horizons'][str(h)]['n'], d['markets']['sp']['eligible_signal_sessions'])
 def test_missing_prices_skipped(self):
  self.frame.loc[self.days[30],'SPY']=float('nan')
  d=evaluate(self.rows,self.frame,self.days[-1]);self.assertLess(d['markets']['sp']['eligible_signal_sessions'],len(self.rows))
 def test_empty(self):
  d=evaluate([],self.frame,self.days[-1]);self.assertEqual(d['markets']['sp']['regimes']['RISK-ON']['horizons']['5']['n'],0)
 def test_one_day_no_overlap_equals_primary(self):
  d=evaluate(self.rows,self.frame,self.days[-1]);x=d['markets']['sp']['regimes']['NEUTRAL']['horizons']['1'];self.assertEqual(x['n'],x['nonoverlap_n'])
if __name__=='__main__':unittest.main()
