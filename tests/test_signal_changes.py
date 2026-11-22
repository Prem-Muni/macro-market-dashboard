import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from engine import scored_signal_changes,signal,SHARED,SP,ND,score_of

class SignalChangesTests(unittest.TestCase):
 def states(self):
  return {k:signal('bull') for k in SHARED+SP+ND}
 def test_scored_changes_categorized_and_no_scoring_effect(self):
  a=self.states();b=self.states()
  a['oil']=signal('bull');b['oil']=signal('bear')
  a['vix']=signal('bear');b['vix']=signal('bull')
  a['qqq_trend']=signal('warn');b['qqq_trend']=signal('bull')
  prev=score_of(a,SHARED+SP);now=score_of(b,SHARED+SP)
  out=scored_signal_changes(a,b,'2026-11-19','2026-11-20')
  self.assertEqual(out['groups']['shared']['new_bearish'][0]['key'],'oil')
  self.assertEqual(out['groups']['sp']['eased'][0]['key'],'vix')
  self.assertEqual(out['groups']['nd']['other'][0]['key'],'qqq_trend')
  self.assertEqual(out['by_key']['oil'],'new_bearish')
  self.assertEqual(out['by_key']['vix'],'eased')
  self.assertEqual(prev['bearish'],now['bearish'])
 def test_unavailable_not_classified_as_improvement(self):
  a=self.states();b=self.states()
  a['credit']=signal('na');b['credit']=signal('bull')
  a['vix']=signal('bear');b['vix']=signal('na')
  out=scored_signal_changes(a,b,'2026-11-19','2026-11-20')
  self.assertNotIn('credit',out['by_key']);self.assertNotIn('vix',out['by_key'])
  self.assertEqual(out['groups']['shared']['skipped'],1)
  self.assertEqual(out['groups']['sp']['skipped'],1)
 def test_info_only_not_in_change_map(self):
  a=self.states();b=self.states();a['sp_breadth5d']=signal('bear');b['sp_breadth5d']=signal('bull')
  out=scored_signal_changes(a,b,'2026-11-19','2026-11-20')
  self.assertNotIn('sp_breadth5d',out['by_key'])
 def test_wash_counts_bearish_not_change_on_bear_to_wash(self):
  a=self.states();b=self.states();a['vix_curve']=signal('bear');b['vix_curve']=signal('wash',label='CAUTION')
  out=scored_signal_changes(a,b,'2026-11-19','2026-11-20')
  self.assertEqual(out['groups']['shared']['new_bearish'],[])
  self.assertEqual(out['groups']['shared']['eased'],[])
if __name__=='__main__':unittest.main()
