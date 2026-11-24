"""Synthetic data only — no market prices are asserted."""
import sys
import unittest
from pathlib import Path
import pandas as pd
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from daily_macd import calculate_daily_macd
from insights_history import make_daily_entry

class MacdTests(unittest.TestCase):
    def setUp(self):
        self.dates=pd.bdate_range('2026-06-01',periods=115)
        self.df=pd.DataFrame({'SPY':[100+i*.2+((i%11)-5)*.4 for i in range(115)],
                              'QQQ':[120+i*.3+((i%7)-3)*.7 for i in range(115)]},index=self.dates)
        self.date=str(self.dates[-1].date())
    def test_macd_formula_matches_separate_ema(self):
        result=calculate_daily_macd(self.df,self.date)
        for symbol in ('SPY','QQQ'):
            c=self.df[symbol]
            ema12=c.ewm(span=12,adjust=False,min_periods=12).mean()
            ema26=c.ewm(span=26,adjust=False,min_periods=26).mean()
            expected=ema12-ema26
            nine=expected.ewm(span=9,adjust=False,min_periods=9).mean()
            record=result[symbol.lower()]
            self.assertEqual(record['status'],'complete')
            self.assertAlmostEqual(record['macd'],expected.iloc[-1],places=4)
            self.assertAlmostEqual(record['signal'],nine.iloc[-1],places=4)
            self.assertAlmostEqual(record['histogram'],expected.iloc[-1]-nine.iloc[-1],places=4)
        self.assertIs(result['scored'],False)
    def test_mismatched_session_yields_na(self):
        after=str((self.dates[-1]+pd.Timedelta(days=3)).date())
        out=calculate_daily_macd(self.df,after)
        self.assertEqual(out['spy']['status'],'unavailable')
        self.assertIsNone(out['qqq']['histogram'])
    def test_insufficient_history_yields_na(self):
        out=calculate_daily_macd(self.df.iloc[-25:],self.date)
        self.assertEqual(out['spy']['status'],'unavailable')
    def test_future_data_never_changes_past(self):
        date=str(self.dates[-4].date())
        earlier=calculate_daily_macd(self.df.iloc[:-3],date)
        later=calculate_daily_macd(self.df,date)
        self.assertEqual(earlier,later)
    def test_crossover_classified_at_signal_boundary(self):
        # Synthetically reversed trends, enough previous days to form a stable EMA.
        dates=pd.bdate_range('2026-01-02',periods=120)
        c=[200-i*.7 if i<80 else 144+(i-80)*1.8 for i in range(120)]
        df=pd.DataFrame({'SPY':c,'QQQ':c},index=dates)
        crosses=[]
        for i in range(35,120):
            r=calculate_daily_macd(df.iloc[:i+1],str(dates[i].date()))
            if r['spy']['crossover']!='none':crosses.append(r['spy']['crossover'])
        self.assertIn('bullish',crosses)
    def test_information_only_history_field(self):
        from test_insights_history import synthetic_snapshot
        snapshot=synthetic_snapshot()
        macd=calculate_daily_macd(self.df,self.date)
        # Match the synthetic insight session; a mismatched date must NOT be logged.
        snapshot['daily_macd']=macd
        row=make_daily_entry(snapshot)
        self.assertIsNone(row['spy']['macd_info'])
        for key in ('spy','qqq'):
            macd[key]['as_of']=snapshot['session']
        row=make_daily_entry(snapshot)
        self.assertEqual(row['spy']['macd_info']['macd'],macd['spy']['macd'])
        self.assertEqual(row['qqq']['macd_info']['signal'],macd['qqq']['signal'])
        self.assertEqual((row['spy']['score'],row['qqq']['score']),(10,11))

    def test_scored_signal_keys_are_not_modified(self):
        # Only appending daily_macd to the snapshot; engine output is separate.
        self.assertNotIn('bearish_score',calculate_daily_macd(self.df,self.date))

if __name__ == '__main__':unittest.main()
