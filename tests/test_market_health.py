import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from engine import score_of,signal
from insights_history import _risk

class MarketHealthConversion(unittest.TestCase):
  keys=[f's{i}' for i in range(15)]
  def generate(self,bearish,missing=0):
    return {k: signal('bear' if i<bearish else 'na' if i>=15-missing else 'warn') for i,k in enumerate(self.keys)}
  def test_exact_classification(self):
    for bear,health,regime in ((0,15,'RISK-ON'),(4,11,'RISK-ON'),(5,10,'NEUTRAL'),(9,6,'NEUTRAL'),(10,5,'RISK-OFF'),(15,0,'RISK-OFF')):
      with self.subTest(bear=bear):
        o=score_of(self.generate(bear),self.keys)
        self.assertEqual((o['health'],o['health_max'],o['regime']), (health,health,regime))
        self.assertEqual(o['bearish'],bear)
        self.assertEqual(_risk(bear,'spy'),regime)
        self.assertEqual(_risk(bear,'qqq'),regime)
  def test_neutral_counts_as_nonbearish(self):
    o=score_of(self.generate(9),self.keys)
    self.assertEqual(o['health'],6)
    self.assertEqual(o['regime'],'NEUTRAL')
  def test_partial_range_crossing_threshold_is_incomplete(self):
    o=score_of(self.generate(9,1),self.keys)
    self.assertEqual((o['health'],o['health_max'],o['regime']), (5,6,'INCOMPLETE'))
  def test_missing_but_certain_off(self):
    o=score_of(self.generate(11,1),self.keys)
    self.assertEqual((o['health'],o['health_max'],o['regime']), (3,4,'RISK-OFF'))
  def test_wash_counts_as_bearish(self):
    o=score_of({self.keys[0]:signal('wash',label='WASHOUT'),**{k:signal('bull') for k in self.keys[1:]}},self.keys)
    self.assertEqual(o['health'],14)
if __name__=='__main__': unittest.main()
