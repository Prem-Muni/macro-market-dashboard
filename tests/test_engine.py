import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import pandas as pd
from engine import analyze,score_of,signal,SP,SHARED,ND,wilder_rsi

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
        self.assertEqual(sp['total'],15); self.assertEqual(nd['total'],15)
        self.assertEqual(sp['available'],14)
        self.assertEqual(nd['available'],14)
        self.assertFalse(any('pc' in k.lower() for k in result['signals']))
        self.assertEqual(result['signals']['sp_breadth1d']['state'],'na')
        self.assertEqual(result['signals']['nd_breadth1d']['state'],'na')
        self.assertEqual(sp['possible_max']-sp['bearish'],1)
        self.assertEqual(result['markets']['sp500']['swing'],'N/A')
    def test_all_data_and_15_signal_counts(self):
        price,extra=self.make(True)
        result=analyze(price,extra)
        for market in ('sp500','nasdaq100'):
            self.assertEqual(result['markets'][market]['score']['available'],15)
            self.assertEqual(result['markets'][market]['score']['total'],15)
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
        self.assertEqual(old['markets']['sp500']['score']['total'],15)
        self.assertEqual(old['markets']['nasdaq100']['score']['total'],15)

    def test_moving_averages_exact_and_informational_only(self):
        price,extra=self.make(True)
        result=analyze(price,extra)
        for sym in ('spy','qqq'):
            ctx=result['moving_averages'][sym]
            self.assertEqual(ctx['as_of'],result['session'])
            close=float(price[sym.upper()].iloc[-1])
            self.assertAlmostEqual(ctx['close'],close,places=2)
            for days in (5,20,50,100,200):
                point=ctx['averages'][str(days)]
                expected=float(price[sym.upper()].tail(days).mean())
                self.assertAlmostEqual(point['value'],round(expected,3),places=3)
                expected_distance=round((close/expected-1)*100,2)
                self.assertAlmostEqual(point['distance_pct'],expected_distance,places=2)
                self.assertEqual(point['state'],'BULLISH' if close >= expected else 'BEARISH')
        self.assertEqual(result['markets']['sp500']['score']['total'],15)
        self.assertEqual(result['markets']['nasdaq100']['score']['total'],15)
        self.assertIn('spy_trend',result['order']['sp500'])
        self.assertIn('qqq_trend',result['order']['nasdaq100'])
        self.assertNotIn('sp_ma_alignment',result['order']['sp500'])
        self.assertNotIn('nd_ma_alignment',result['order']['nasdaq100'])

    def test_equal_to_sma_is_bullish_below_is_bearish(self):
        price,extra=self.make(True)
        # Construct a flat price series: closing price equals each SMA exactly.
        for ticker in ('SPY','QQQ'):
            price[ticker]=500.0
        result=analyze(price,extra)
        for sym in ('spy','qqq'):
            for period in (5,20,50,100,200):
                point=result['moving_averages'][sym]['averages'][str(period)]
                self.assertEqual(point['value'],500.0)
                self.assertEqual(point['distance_pct'],0.0)
                self.assertEqual(point['state'],'BULLISH')
        # Slightly below MA on latest session; difference may round to 0.00%.
        for ticker in ('SPY','QQQ'):
            price.loc[price.index[-1],ticker]=499.999
        result=analyze(price,extra)
        for sym in ('spy','qqq'):
            for period in (5,20,50,100,200):
                point=result['moving_averages'][sym]['averages'][str(period)]
                self.assertEqual(point['state'],'BEARISH')
                self.assertEqual(point['distance_pct'],0.0)
        self.assertEqual(result['markets']['sp500']['score']['total'],15)
        self.assertEqual(result['markets']['nasdaq100']['score']['total'],15)

    def test_wilder_rsi_reference_and_extremes(self):
        # Wilder's published 14-period worked example: first RSI is ~70.46.
        # This uses a known sequence of closing prices; no live feed involved.
        closes=[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,
                46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,
                46.22,45.64,46.21]
        series=pd.Series(closes)
        rsi=wilder_rsi(series,14)
        self.assertTrue(rsi.iloc[:14].isna().all())
        # Reference value based on these supplied sample price changes.
        gains=series.diff().clip(lower=0).iloc[1:15].mean()
        losses=(-series.diff().clip(upper=0)).iloc[1:15].mean()
        expected=100-100/(1+gains/losses)
        self.assertAlmostEqual(rsi.iloc[14],expected,places=8)
        self.assertTrue(0<=rsi.iloc[-1]<=100)
        self.assertEqual(wilder_rsi(pd.Series([1.0]*20),14).iloc[-1],50.0)
        self.assertEqual(wilder_rsi(pd.Series(range(30)),14).iloc[-1],100.0)
        self.assertEqual(wilder_rsi(pd.Series(range(30,0,-1)),14).iloc[-1],0.0)

    def test_rsi_scored_and_100d_sma_informational(self):
        price,extra=self.make(True)
        result=analyze(price,extra)
        for sym in ('spy','qqq'):
            context=result['moving_averages'][sym]
            self.assertAlmostEqual(context['averages']['100']['value'],
                                   round(float(price[sym.upper()].tail(100).mean()),3),places=3)
            self.assertEqual(context['rsi']['period'],14)
            self.assertTrue(0<=context['rsi']['value']<=100)
            self.assertEqual(context['rsi']['state'],'OVERBOUGHT')
        self.assertEqual(result['markets']['sp500']['score']['total'],15)
        self.assertEqual(result['markets']['nasdaq100']['score']['total'],15)
        self.assertIn('sp_rsi14',result['order']['sp500'])
        self.assertIn('nd_rsi14',result['order']['nasdaq100'])
        self.assertEqual(result['signals']['sp_rsi14']['state'],'bull')
        self.assertEqual(result['signals']['nd_rsi14']['state'],'bull')

    def test_insufficient_history_rsi_not_fabricated(self):
        price,extra=self.make(True)
        result=analyze(price.tail(14),extra.tail(14))
        for sym in ('spy','qqq'):
            self.assertIsNone(result['moving_averages'][sym]['rsi']['value'])
            self.assertEqual(result['moving_averages'][sym]['rsi']['state'],'N/A')
            self.assertIsNone(result['moving_averages'][sym]['averages']['100']['value'])

    def test_missing_200day_average_is_unavailable_not_zero(self):
        price,extra=self.make(True)
        shorter=price.tail(100)
        result=analyze(shorter,extra.tail(100))
        for sym in ('spy','qqq'):
            self.assertIsNone(result['moving_averages'][sym]['averages']['200']['value'])
            self.assertIsNone(result['moving_averages'][sym]['averages']['200']['distance_pct'])
            self.assertIsNotNone(result['moving_averages'][sym]['averages']['5']['value'])

    def test_risk_bounds(self):
        keys=SHARED+SP
        signals={key:signal('bull') for key in keys}
        for key in SHARED: signals[key]=signal('bear')
        signals['sp_def']=signal('bear')
        signals['vix']=signal('na')
        signals['sp_breadth1d']=signal('na')
        score=score_of(signals,keys)
        self.assertEqual(score['regime'],'INCOMPLETE')
        self.assertEqual(score['possible_max'],9)
        self.assertEqual(score['total'],15)
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
        self.assertGreater(len(res['history']),90)

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


class NewTechnicalScoringTests(unittest.TestCase):
    def test_original_14point_model_is_new_model_minus_rsi(self):
        base=EngineTests()
        price,extra=base.make(True)
        result=analyze(price,extra)
        for market in ('sp500','nasdaq100'):
            new=result['markets'][market]['score']
            old=result['markets'][market]['legacy_14']
            self.assertEqual((new['total'],old['total']),(15,14))
            self.assertEqual(new['available'],15)
            self.assertEqual(old['available'],14)
            rsi_key='sp_rsi14' if market=='sp500' else 'nd_rsi14'
            rsi_bear=result['signals'][rsi_key]['state']=='bear'
            self.assertEqual(new['bearish'], old['bearish']+int(rsi_bear))
        self.assertIn('spy_trend',result['order']['sp500'])
        self.assertIn('qqq_trend',result['order']['nasdaq100'])
        self.assertTrue(all(0<=row['sp']<=15 and 0<=row['nd']<=15 for row in result['history']))

    def test_original_trend_bearish_bullish_and_caution(self):
        from engine import build_day, build_frames
        price,extra=EngineTests().make(True)
        f=build_frames(price,extra)
        row=len(f)-1
        # Bearish whenever close < 200-day SMA, even if 50-day SMA is lower.
        f.iloc[row,f.columns.get_loc('SPY')]=99.0
        f.iloc[row,f.columns.get_loc('spy_ma50')]=97.0
        f.iloc[row,f.columns.get_loc('spy_ma200')]=100.0
        _,signals=build_day(f,row)
        self.assertEqual(signals['spy_trend'].state,'bear')
        # Bullish only when close > 50D > 200D.
        f.iloc[row,f.columns.get_loc('SPY')]=105.0
        f.iloc[row,f.columns.get_loc('spy_ma50')]=103.0
        _,signals=build_day(f,row)
        self.assertEqual(signals['spy_trend'].state,'bull')
        # CAUTION when above 200D but not a bullish trend.
        f.iloc[row,f.columns.get_loc('SPY')]=101.0
        f.iloc[row,f.columns.get_loc('spy_ma50')]=103.0
        _,signals=build_day(f,row)
        self.assertEqual(signals['spy_trend'].state,'warn')
        # Exact equality at 200D is caution under original Trend rule.
        f.iloc[row,f.columns.get_loc('SPY')]=100.0
        _,signals=build_day(f,row)
        self.assertEqual(signals['spy_trend'].state,'warn')

    def test_shorter_sma_changes_do_not_change_score(self):
        from engine import build_day, build_frames, score_of
        price,extra=EngineTests().make(True)
        f=build_frames(price,extra)
        row=len(f)-1
        _,before=build_day(f,row)
        a=score_of(before,SHARED+SP)
        # Extreme changes to 5D, 20D, 100D must not influence score.
        for period in (5,20,100):
            f.iloc[row,f.columns.get_loc('spy_ma'+str(period))]=0.01
        _,after=build_day(f,row)
        b=score_of(after,SHARED+SP)
        self.assertEqual((a['bearish'],a['possible_max']), (b['bearish'],b['possible_max']))
        self.assertNotIn('sp_ma_alignment',after)
        self.assertEqual(after['spy_trend'].state,before['spy_trend'].state)

    def test_rsi_thresholds_score_one_point_only(self):
        from engine import build_day,build_frames
        base=EngineTests()
        price,extra=base.make(True)
        f=build_frames(price,extra)
        last=len(f)-1
        f.iloc[last,f.columns.get_loc('spy_rsi14')]=44.999
        _,signals=build_day(f,last)
        self.assertEqual(signals['sp_rsi14'].state,'bear')
        f.iloc[last,f.columns.get_loc('spy_rsi14')]=45
        _,signals=build_day(f,last)
        self.assertEqual(signals['sp_rsi14'].state,'warn')
        f.iloc[last,f.columns.get_loc('spy_rsi14')]=55
        _,signals=build_day(f,last)
        self.assertEqual(signals['sp_rsi14'].state,'warn')
        f.iloc[last,f.columns.get_loc('spy_rsi14')]=55.001
        _,signals=build_day(f,last)
        self.assertEqual(signals['sp_rsi14'].state,'bull')
        self.assertEqual(sum(k.endswith('rsi14') for k in SP),1)

    def test_missing_200day_trend_fails_closed(self):
        price,extra=EngineTests().make(True)
        result=analyze(price.tail(100),extra.tail(100))
        self.assertEqual(result['signals']['spy_trend']['state'],'na')
        self.assertEqual(result['signals']['qqq_trend']['state'],'na')
        self.assertEqual(result['markets']['sp500']['score']['missing'],1)
        self.assertEqual(result['markets']['nasdaq100']['score']['missing'],1)

    def test_rsi_overbought_remains_bullish_momentum(self):
        base=EngineTests()
        price,extra=base.make(True)
        result=analyze(price,extra)
        self.assertEqual(result['moving_averages']['spy']['rsi']['state'],'OVERBOUGHT')
        self.assertEqual(result['signals']['sp_rsi14']['state'],'bull')

