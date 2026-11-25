"""Offline tests: no API key or external service is required to run these tests."""
import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import Mock
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from public_eod import (_parse_nasdaq_history, fetch_public_daily, recover_public_etf_closes,
                        _valid_against_yahoo)

D = pd.to_datetime(['2026-11-19','2026-11-20','2026-11-23'])
TARGET = date(2026,11,24)

def history(base):
    return pd.Series([base,base*1.01,base*1.02], index=D, dtype=float)

def alternate(base, pct=0):
    return pd.Series([base*(1+pct),base*1.01*(1+pct),base*1.02*(1+pct),base*1.04*(1+pct)],
                     index=pd.to_datetime(['2026-11-19','2026-11-20','2026-11-23','2026-11-24']))

class NasdaqCases(unittest.TestCase):
    def valid_payload(self):
        return {'data': {'tradesTable': {'rows': [
          {'date':'11/23/2026','close':'$100.25'},
          {'date':'11/24/2026','close':'$101.25'}
        ]}}}
    def test_json_date_and_close(self):
        r=_parse_nasdaq_history(self.valid_payload())
        self.assertAlmostEqual(float(r.loc['2026-11-24']),101.25)
    def test_reject_json_missing_table(self):
        with self.assertRaises(ValueError): _parse_nasdaq_history({'data':None})
    def test_reject_json_empty(self):
        with self.assertRaises(ValueError): _parse_nasdaq_history({'data':{'tradesTable':{'rows':[]}}})
    def test_reject_bad_close(self):
        with self.assertRaises(ValueError): _parse_nasdaq_history({'data':{'tradesTable':{'rows':[{'date':'11/24/2026','close':'N/A'}]}}})
    def test_reject_non_json(self):
        with self.assertRaises(ValueError): _parse_nasdaq_history('captcha')
    def test_http_url_params_no_key(self):
        response=Mock();response.json.return_value=self.valid_payload()
        request=Mock(return_value=response)
        out=fetch_public_daily('SPY',TARGET,get=request)
        self.assertEqual(out.loc['2026-11-24'],101.25)
        args,kwargs=request.call_args
        self.assertIn('api.nasdaq.com',args[0]);self.assertEqual(kwargs['params']['assetclass'],'etf')
        self.assertEqual(kwargs['params']['todate'],'2026-11-24')
        self.assertFalse('apikey' in str(kwargs).lower())
    def test_unknown_symbol_not_fetched(self):
        with self.assertRaises(ValueError): fetch_public_daily('BTC',TARGET,get=Mock())

class FallbackCases(unittest.TestCase):
    def setUp(self):
        self.prices={'SPY':history(100),'QQQ':history(200),'RSP':history(50)}
        self.sources={key:'Yahoo' for key in self.prices}
        self.errors=[]

    def test_good_completed_closes_recover(self):
        data={'SPY':alternate(100),'QQQ':alternate(200),'RSP':alternate(50)}
        status=recover_public_etf_closes(self.prices,self.sources,self.errors,TARGET,
                                         fetch=lambda s,d:data[s])
        self.assertIn('recovered',status['SPY']);self.assertIn('recovered',status['QQQ'])
        self.assertIn('recovered',status['RSP'])
        self.assertEqual(len(self.prices['SPY']),4)
        self.assertAlmostEqual(self.prices['QQQ'].loc['2026-11-24'],208.0)
        self.assertAlmostEqual(self.prices['SPY'].loc['2026-11-23'],102)
    def test_existing_latest_kept(self):
        self.prices['SPY'].loc[pd.Timestamp(TARGET)]=106.0
        old=self.prices['SPY'].copy()
        status=recover_public_etf_closes(self.prices,self.sources,self.errors,TARGET,
                                         fetch=lambda s,d:alternate(200 if s=='QQQ' else 50))
        self.assertEqual(status['SPY'],'already current via primary feed')
        pd.testing.assert_series_equal(self.prices['SPY'],old)
    def test_stale_alt_rejected(self):
        data={'SPY':alternate(100).iloc[:-1],'QQQ':alternate(200)}
        status=recover_public_etf_closes(self.prices,self.sources,self.errors,TARGET,
                                         fetch=lambda s,d:data[s])
        self.assertIn('rejected',status['SPY']);self.assertNotIn(pd.Timestamp(TARGET),self.prices['SPY'])
        self.assertNotIn(pd.Timestamp(TARGET),self.prices['RSP'])
    def test_adjusted_price_difference_rejected(self):
        status=recover_public_etf_closes(self.prices,self.sources,self.errors,TARGET,
                                         fetch=lambda s,d:alternate(100 if s=='SPY' else 200,0.03))
        self.assertIn('different price basis',status['SPY'])
        self.assertEqual(self.sources['SPY'],'Yahoo')
    def test_small_vendor_difference_accepted(self):
        ok,msg=_valid_against_yahoo(history(100),alternate(100,0.005),pd.Timestamp(TARGET))
        self.assertTrue(ok,msg)
    def test_too_few_overlaps_rejected(self):
        x=alternate(100).iloc[-2:]
        ok,msg=_valid_against_yahoo(history(100),x,pd.Timestamp(TARGET))
        self.assertFalse(ok);self.assertIn('two overlapping',msg)
    def test_outlier_move_rejected(self):
        x=alternate(100);x.loc[pd.Timestamp(TARGET)]=250
        ok,msg=_valid_against_yahoo(history(100),x,pd.Timestamp(TARGET))
        self.assertFalse(ok);self.assertIn('25%',msg)
    def test_service_unavailable_preserves(self):
        old=self.prices['SPY'].copy()
        def offline(*args): raise ConnectionError('source unavailable')
        statuses=recover_public_etf_closes(self.prices,self.sources,self.errors,TARGET,fetch=offline)
        self.assertIn('unavailable',statuses['SPY']);self.assertGreater(len(self.errors),0)
        pd.testing.assert_series_equal(self.prices['SPY'],old)
    def test_cannot_fill_nonetf(self):
        self.prices['VIX']=history(30)
        recover_public_etf_closes(self.prices,self.sources,self.errors,TARGET,
                                   fetch=lambda s,d:alternate({'SPY':100,'QQQ':200,'RSP':50}.get(s,300)))
        self.assertNotIn(pd.Timestamp(TARGET),self.prices['VIX'])

if __name__=='__main__':unittest.main()
