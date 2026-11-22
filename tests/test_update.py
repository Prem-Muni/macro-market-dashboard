import sys
import unittest
from pathlib import Path
import pandas as pd
from unittest.mock import patch
from tempfile import TemporaryDirectory
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from types import ModuleType
# Standalone patch tests do not need the live breadth downloader.
if "breadth" not in sys.modules:
    breadth=ModuleType("breadth")
    breadth.derive_breadth=lambda *args,**kwargs:(None,{},[])
    sys.modules["breadth"]=breadth
import update

class SupplementalDataTests(unittest.TestCase):
    def test_old_options_columns_ignored(self):
        with TemporaryDirectory() as d:
            root=Path(d)
            (root/'inputs').mkdir()
            (root/'inputs'/'supplemental.csv').write_text('date,SPX_PCR,NDX_PCR,SPX_BREADTH200,NDX_ADV,NDX_DECL\n2026-11-20,1.481,1.144,48.7,55,45\n')
            with patch.object(update,'ROOT',root), patch.dict('os.environ',{'SUPPLEMENTAL_DATA_URL':''}):
                df,errors=update.load_extra()
            self.assertEqual(list(df.columns),['SPX_BREADTH200','NDX_ADV','NDX_DECL'])
            self.assertEqual(errors,[])

if __name__=='__main__':unittest.main()
