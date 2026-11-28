"""Offline exact-date repair coverage for a saved EOD snapshot."""
from copy import deepcopy
import json,sys
from pathlib import Path
from datetime import date
import pandas as pd
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from update import can_repair_vxn,repair_vxn_only
from engine import volatility_signal

def test_volatility_boundaries():
    for value,state in [(19.99,"bull"),(20,"warn"),(25,"warn"),(25.01,"bear"),(float("inf"),"na"),(0,"na")]:
        assert volatility_signal("vxn",value).state==state

def test_targeted_repair_preserves_saved_observations():
    # Fixture is a genuinely published partial snapshot, copied into the test
    # fixture at development time, rather than depending on future live data.
    before=json.loads((ROOT/"tests"/"fixtures"/"vxn_partial_20261127.json").read_text())
    day=date(2026,11,27)
    assert can_repair_vxn(before,day)
    for d,v in [("2026-11-25",38.53),("2026-11-30",33.34),("2026-11-27",float("inf")),("2026-11-27",-1)]:
        assert repair_vxn_only(before,pd.Series([v],index=pd.to_datetime([d])),day,"fixture") is None
    copy_before=deepcopy(before)
    series=pd.Series([44.,38.53,33.34],index=pd.to_datetime(["2026-11-19","2026-11-25","2026-11-27"]))
    after=repair_vxn_only(before,series,day,"fixture")
    assert after["markets"]["nasdaq100"]["score"]["health"]==7
    assert after["markets"]["nasdaq100"]["score"]["available"]==16
    assert after["markets"]["nasdaq100"]["momentum"]["d1_range"]==[-1,-1]
    assert after["markets"]["nasdaq100"]["confirmation"]["confirmed"]==3
    assert before==copy_before
    assert after["price_moves"]==before["price_moves"]
    assert after["markets"]["sp500"]==before["markets"]["sp500"]
    assert all(after["signals"][k]==v for k,v in before["signals"].items() if k!="vxn")
    assert after["market_insights_history"]["entries"][:-1]==before["market_insights_history"]["entries"][:-1]
    assert after["market_insights_history"]["entries"][-1]["qqq"]["available"]==16
    assert after["source_audit"]["observations"]["VXN"]["observation_session"]=="2026-11-27"
    assert repair_vxn_only(after,series,day,"fixture") is None
