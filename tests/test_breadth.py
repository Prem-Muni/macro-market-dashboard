import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import pandas as pd
from breadth import calculate_breadth, extract_tickers, normalize_ticker, _close_from_batch


class BreadthTests(unittest.TestCase):
    def test_ticker_normalization(self):
        self.assertEqual(normalize_ticker('BRK.B'), 'BRK-B')
        self.assertEqual(normalize_ticker('GOOGL'), 'GOOGL')
        self.assertIsNone(normalize_ticker('BAD/TICKER'))

    def test_table_selector_requires_plausible_index_size(self):
        sp = ''.join(f'<tr><td>A{i:04d}</td></tr>' for i in range(500))
        html = '<table><tr><th>Symbol</th></tr>' + sp + '</table>'
        syms = extract_tickers(html, 'SP500')
        self.assertEqual(len(syms), 500)
        bad = '<table><tr><th>Ticker</th></tr><tr><td>AAPL</td></tr></table>'
        with self.assertRaises(ValueError):
            extract_tickers(bad, 'NDX100')

    def make(self):
        days = pd.bdate_range('2025-01-02', periods=275)
        a = pd.Series([100+i*.1 for i in range(275)], index=days)
        b = pd.Series([100-i*.1 for i in range(275)], index=days)
        c = pd.Series([130+i*.2 for i in range(275)], index=days)
        return days, {'UP1':a, 'DOWN':b, 'UP2':c}

    def test_estimated_breadth_uses_same_fixed_universe(self):
        days, closes = self.make()
        universe = {'SP500': ['UP1', 'DOWN', 'UP2'], 'NDX100': ['UP1', 'DOWN', 'UP2']}
        result, coverage, warnings = calculate_breadth(days, universe, closes)
        self.assertEqual(coverage['SP500'], 100)
        self.assertEqual(coverage['NDX100'], 100)
        self.assertAlmostEqual(result['SPX_BREADTH200'].iloc[-1], 200/3, places=4)
        self.assertEqual(result['NDX_ADV'].iloc[-1], 2)
        self.assertEqual(result['NDX_DECL'].iloc[-1], 1)

    def test_missing_history_blocks_partial_estimate(self):
        days, closes = self.make()
        universe = {'SP500': ['UP1', 'DOWN', 'UP2', 'MISS'], 'NDX100': ['UP1', 'DOWN', 'UP2', 'MISS']}
        result, coverage, warnings = calculate_breadth(days, universe, closes)
        self.assertEqual(coverage['SP500'], 75)
        self.assertTrue(result['SPX_BREADTH200'].isna().all())
        self.assertTrue(result['NDX_ADV'].isna().all())
        self.assertTrue(any('below 95%' in x for x in warnings))

if __name__ == '__main__':
    unittest.main()
