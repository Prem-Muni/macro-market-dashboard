"""Synthetic 16-point Market Health MACD regression tests; no market prices used."""
import sys, unittest
from pathlib import Path
import numpy as np
import pandas as pd
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from engine import SHARED, SP, ND, analyze, score_of, signal
from daily_macd import calculate_daily_macd
from insights_history import merge_daily_archive, _score_now
from test_insights_history import synthetic_snapshot

class SixteenPointMACD(unittest.TestCase):
    def test_key_count_and_macd_exclusive_index(self):
        self.assertEqual(len(SHARED),6)
        self.assertEqual(len(SP),10)
        self.assertEqual(len(ND),10)
        self.assertIn('sp_macd', SP)
        self.assertIn('nd_macd', ND)
        self.assertNotIn('sp_macd',SHARED)

    def test_boundary_and_missing_macd_are_bounded(self):
        keys=SHARED+SP
        self.assertEqual(len(keys),16)
        all_bear={k:signal('bear') for k in keys}
        base=score_of(all_bear,keys)
        self.assertEqual((base['health'],base['health_max'],base['total']), (0,0,16))
        all_bear['sp_macd']=signal('bull')
        self.assertEqual(score_of(all_bear,keys)['health'],1)
        all_bear['sp_macd']=signal('na')
        partial=score_of(all_bear,keys)
        self.assertEqual((partial['health'],partial['health_max'],partial['available']), (0,1,15))
        self.assertNotEqual(partial['health_max'],0)

    def test_full_synthetic_engine_matches_macd_module(self):
        dates=pd.bdate_range('2025-05-01',periods=350)
        n=len(dates)
        x=np.arange(n)
        base=140+x*.12+np.sin(x/9)*3
        c={
            'SPY':base,'QQQ':115+x*.15+np.sin(x/7)*4,
            'SMH':96+x*.24+np.sin(x/12)*2,'IWM':110+x*.10,
            'RSP':111+x*.13,'QQQE':113+x*.12,
            'OIL':70+x*.02,'USD':104+x*.002,'TNX':38+np.cos(x/9),
            'COPPER':4+x*.001,'VIX':25+np.sin(x/9)*3,
            'VXN':31+np.sin(x/8)*3,'VIX3M':29+np.cos(x/11),
            'HYG':70+x*.03,'IEF':94+x*.01,'XLP':80+x*.09,
            'XLV':83+x*.1,'XLU':70+x*.05,'XLE':72+x*.11,
        }
        prices=pd.DataFrame(c,index=dates,dtype=float)
        extra=pd.DataFrame({'SPX_BREADTH200': 45+x*.03,'NDX_ADV':52+np.sin(x/8)*10,'NDX_DECL':48-np.sin(x/8)*10},index=dates)
        output=analyze(prices,extra,history_months=6)
        macd=calculate_daily_macd(prices,output['session'])
        for sym,key,mkt in [('spy','sp_macd','sp500'),('qqq','nd_macd','nasdaq100')]:
            state=output['signals'][key]['state']
            hist=macd[sym]['histogram']
            self.assertEqual(state,'bull' if hist>=0 else 'bear')
            score=output['markets'][mkt]['score']
            self.assertEqual(score['total'],16)
            self.assertEqual(score['health'],score['available']-score['bearish'])
            self.assertEqual(output['markets'][mkt]['legacy_15']['total'],15)
            self.assertEqual(output['markets'][mkt]['legacy_14']['total'],14)
            self.assertEqual(output['history'][-1]['sp_available'] if sym=='spy' else output['history'][-1]['nd_available'],score['available'])
        self.assertEqual(output['risk_policy']['fear_greed_scored'],False)
        self.assertIn('16-point',output['model_version'])

    def test_legacy_archive_stays_15_new_archive_16(self):
        old=synthetic_snapshot()
        archive=merge_daily_archive({},old)
        oldscore=archive['entries'][-1]['spy']
        self.assertEqual(oldscore['total'],15)
        self.assertEqual(oldscore['score'],10)
        fresh=synthetic_snapshot()
        fresh['session']='2026-11-24'
        fresh['price_moves']['session']='2026-11-24'
        fresh['price_moves']['previous_session']='2026-11-23'
        fresh['price_moves']['spy'].update(previous_close=722.29,close=724,change_pct=round((724/722.29-1)*100,5))
        fresh['price_moves']['qqq'].update(previous_close=651.03,close=653,change_pct=round((653/651.03-1)*100,5))
        for sym,model in [('spy','sp500'),('qqq','nasdaq100')]:
            fresh['moving_averages'][sym].update(as_of='2026-11-24',close=fresh['price_moves'][sym]['close'])
            s=fresh['markets'][model]['score'];s['total']=16;s['available']=16;s['bearish']=11 if sym=='spy' else 12;s['regime']='RISK-OFF'
        fresh['history']=[{'date':'2026-11-23','sp':11,'nd':12,'sp_available':16,'nd_available':16}, {'date':'2026-11-24','sp':11,'nd':12,'sp_available':16,'nd_available':16}]
        fresh['model_version']='16-point-health-v2-macd'
        new_archive=merge_daily_archive({'market_insights_history':archive},fresh)
        self.assertEqual([row['session'] for row in new_archive['entries']],['2026-11-20','2026-11-23','2026-11-24'])
        self.assertEqual(new_archive['entries'][1]['spy']['total'],15)
        self.assertEqual(new_archive['entries'][2]['spy']['total'],16)
        self.assertEqual(new_archive['entries'][1]['spy']['score'],10)

if __name__=='__main__':unittest.main()
