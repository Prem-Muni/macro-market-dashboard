import unittest
from datetime import date
from unittest.mock import Mock
import pandas as pd

from eod_recovery import _close_series, recover_missing_equity_closes


class TestDailyRecovery(unittest.TestCase):
    DAY = date(2026, 11, 24)

    @staticmethod
    def old():
        return pd.Series([689.81], index=pd.to_datetime(['2026-11-23']))

    def test_recovers_spy_and_qqq_without_overwriting_prior_bars(self):
        prices = {'SPY': self.old(), 'QQQ': self.old()}
        sources, warnings = {}, []
        def ticker(name):
            price = {'SPY': 690.12, 'QQQ': 609.23}[name]
            return Mock(history=lambda **kw: pd.DataFrame({'Close': [price]}, index=pd.to_datetime(['2026-11-24'])))
        def no_fallback(**kwargs):
            self.fail('should not call second recovery strategy')
        result = recover_missing_equity_closes(prices, sources, warnings, self.DAY, ticker, no_fallback)
        self.assertEqual(result['SPY'], 'recovered 2026-11-24 using Ticker.history(10d)')
        self.assertEqual(prices['SPY'].loc[pd.Timestamp('2026-11-23')], 689.81)
        self.assertEqual(prices['SPY'].loc[pd.Timestamp('2026-11-24')], 690.12)
        self.assertEqual(prices['QQQ'].loc[pd.Timestamp('2026-11-24')], 609.23)

    def test_second_daily_method_when_first_is_stale(self):
        prices = {'SPY': self.old(), 'QQQ': self.old()}
        warnings = []
        def ticker(name):
            return Mock(history=lambda **kw: pd.DataFrame({'Close': [1]}, index=pd.to_datetime(['2026-11-23'])))
        def fallback(**kwargs):
            sym = kwargs['tickers']
            prices = {'SPY': 692, 'QQQ': 611}
            cols = pd.MultiIndex.from_tuples([(sym, 'Close')])
            return pd.DataFrame([[prices[sym]]], columns=cols, index=pd.to_datetime(['2026-11-24']))
        result = recover_missing_equity_closes(prices, {}, warnings, self.DAY, ticker, fallback)
        self.assertIn('download(10d)', result['SPY'])
        self.assertEqual(prices['QQQ'].loc[pd.Timestamp('2026-11-24')], 611)

    def test_rejects_empty_nan_and_stale_data(self):
        prices = {'SPY': self.old(), 'QQQ': self.old()}
        source, warnings = {}, []
        before = prices['SPY'].copy()
        def ticker(name):
            return Mock(history=lambda **kw: pd.DataFrame({'Close': [float('nan')]}, index=pd.to_datetime(['2026-11-24'])))
        def second(**kwargs):
            return pd.DataFrame({'Close': [8]}, index=pd.to_datetime(['2026-11-23']))
        result = recover_missing_equity_closes(prices, source, warnings, self.DAY, ticker, second)
        self.assertIn('not available', result['SPY'])
        pd.testing.assert_series_equal(prices['SPY'], before)
        self.assertFalse(source)

    def test_does_not_fetch_when_already_current(self):
        prices = {k: pd.Series([42], index=pd.to_datetime(['2026-11-24'])) for k in ('SPY','QQQ')}
        def fail(_): self.fail('unnecessary request')
        result = recover_missing_equity_closes(prices, {}, [], self.DAY, fail, fail)
        self.assertEqual(result, {'SPY':'already current', 'QQQ':'already current'})

    def test_keeps_exchange_date_for_timezone_aware_bars(self):
        idx = pd.DatetimeIndex(['2026-11-24 00:00:00'], tz='America/New_York')
        s = _close_series(pd.DataFrame({'Close': [710]}, index=idx), 'SPY')
        self.assertEqual(s.index.max().date(), self.DAY)


if __name__ == '__main__':
    unittest.main()
