import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import pandas as pd
from engine import analyze,historical_backtest

class HistoricalBacktestTests(unittest.TestCase):
    @staticmethod
    def stub(day, sp, nd, complete=True):
        def sc(v):
            return {'bearish':v,'possible_max':v if complete else v+1,
                    'total':15,'available':15 if complete else 14,
                    'missing':0 if complete else 1,'complete':complete}
        return {'date':pd.Timestamp(day).strftime('%Y-%m-%d'),'sp':sc(sp),'nd':sc(nd)}

    def test_complete_only_counts_and_no_lookahead_returns(self):
        dates=pd.bdate_range('2026-01-05',periods=10)
        frame=pd.DataFrame({'SPY':[100,101,102,103,104,105,106,107,108,109],
                            'QQQ':[200,201,202,203,204,205,206,207,208,209]},index=dates)
        records=[self.stub(d,5 if i==0 or i==1 else 4 if i==2 else 7,5 if i in (0,3) else 8,
                           complete=i!=3) for i,d in enumerate(dates)]
        res=historical_backtest(records,frame,dates[-1])['year']
        sp=res['markets']['sp'];nd=res['markets']['nd']
        self.assertEqual((sp['zero_to_four']['days'],sp['exactly_five']['days'],sp['zero_to_five']['days']),(1,2,3))
        self.assertEqual(sp['complete_days'],9)
        self.assertEqual(sp['incomplete_days'],1)
        self.assertEqual(nd['zero_to_five']['days'],1) # incomplete day 3 should not count
        self.assertEqual(sp['exactly_five']['forward5_observations'],2)
        self.assertAlmostEqual(sp['exactly_five']['forward5_mean_pct'],round(((105/100-1)+(106/101-1))*50,3))
        self.assertEqual(sp['zero_to_four']['forward5_observations'],1)

    def test_excludes_recent_pending_forward_returns(self):
        dates=pd.bdate_range('2026-11-02',periods=6)
        f=pd.DataFrame({'SPY':range(100,106),'QQQ':range(200,206)},index=dates)
        r=[self.stub(d,5,5) for d in dates]
        res=historical_backtest(r,f,dates[-1])['year']['markets']['sp']['zero_to_five']
        self.assertEqual(res['days'],6)
        self.assertEqual(res['forward5_observations'],1)

    def test_score_five_trend_categories_and_forward_returns(self):
        dates=pd.bdate_range('2026-05-01',periods=24)
        frame=pd.DataFrame({'SPY':[100+i for i in range(len(dates))],
                            'QQQ':[200+i for i in range(len(dates))]},index=dates)
        # At i=8 delta 5-8=-3 improving, i=9 delta 5-5=0 stable,
        # i=10 delta 5-2=+3 deteriorating, and i=11 prior incomplete.
        scores=[8,7,7,8,5,2,8,8,5,5,5,5]+[9]*12
        records=[self.stub(d,v,v,complete=i!=6) for i,(d,v) in enumerate(zip(dates,scores))]
        result=historical_backtest(records,frame,dates[-1])['year']['markets']['nd']
        categories=result['score_five_trend']
        self.assertEqual(categories['improving']['days'],1)
        self.assertEqual(categories['stable']['days'],1)
        self.assertEqual(categories['deteriorating']['days'],1)
        self.assertEqual(categories['unavailable']['days'],2)
        self.assertEqual(sum(categories[k]['days'] for k in categories),result['exactly_five']['days'])
        self.assertEqual(categories['improving']['forward5_observations'],1)
        self.assertGreater(categories['improving']['forward5_mean_pct'],0)
        self.assertEqual(categories['improving']['forward5_worst_close_mean_pct'],0.0)
        self.assertEqual(result['zero_to_four_plus_five_improving']['days'],
                         result['zero_to_four']['days']+categories['improving']['days'])

    def test_score_five_uses_no_future_score_and_skips_pending_returns(self):
        dates=pd.bdate_range('2026-08-03',periods=9)
        f=pd.DataFrame({'SPY':[100,101,102,103,104,105,106,107,108],
                        'QQQ':[200,201,202,203,204,205,206,207,208]},index=dates)
        records=[self.stub(d,5,5) for d in dates]
        res=historical_backtest(records,f,dates[-1])['year']['markets']['nd']['score_five_trend']
        self.assertEqual(res['unavailable']['days'],5) # missing previous score
        self.assertEqual(res['stable']['days'],4)
        self.assertEqual(res['stable']['forward5_observations'],0) # 5-day future not present

    def test_20mo_window_date_and_full_history(self):
        from test_engine import EngineTests
        data,extra=EngineTests().make(True)
        out=analyze(data,extra)
        self.assertGreater(len(out['history']),90)
        self.assertTrue(all('sp_max' in p and 'nd_max' in p for p in out['history']))
        self.assertIn('twenty_months',out['backtest'])
        self.assertIn('year',out['backtest'])
        self.assertEqual(out['markets']['sp500']['score']['total'],15)
        self.assertEqual(out['markets']['nasdaq100']['score']['total'],15)
        self.assertEqual(out['backtest']['twenty_months']['sessions'],len(out['history']))
        self.assertEqual(out['backtest']['year']['end'],out['session'])

if __name__=='__main__':unittest.main()

class BreadthHistoricalCoverageTests(unittest.TestCase):
    def test_missing_historical_constituents_produce_null_breadth(self):
        from breadth import calculate_breadth
        days=pd.bdate_range('2025-01-01',periods=460)
        prices={f'X{i}':pd.Series([100+j*.1 for j in range(460)],index=days,dtype=float)
                for i in range(20)}
        # Current universe has valid latest data, but many symbols have no
        # history at an older session: its breadth must be missing (not zero).
        for i in range(2,20):
            prices[f'X{i}'].iloc[202]=float('nan')
        membership={'SP500':list(prices),'NDX100':list(prices)}
        df,coverage,_=calculate_breadth(days,membership,prices)
        self.assertEqual(coverage['SP500'],100)
        self.assertTrue(pd.isna(df['SPX_BREADTH200'].iloc[202]))
        self.assertTrue(pd.isna(df['NDX_ADV'].iloc[202]))
        self.assertTrue(pd.isna(df['NDX_DECL'].iloc[203]))
        self.assertTrue(pd.notna(df['SPX_BREADTH200'].iloc[-1]))
