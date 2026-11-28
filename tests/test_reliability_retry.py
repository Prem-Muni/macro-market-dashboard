import sys,copy
from pathlib import Path
from datetime import datetime,date
from zoneinfo import ZoneInfo
import pandas as pd
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from update import use_published_prior,protect_retry
from schedule_gate import eligible,EARLY_CRON
from eod_recovery import recover_vxn_close
CT=ZoneInfo("America/Chicago")

def test_schedule_gate():
    for y,m,d in [(2026,11,27),(2028,7,3)]:
        assert not eligible("schedule",EARLY_CRON,datetime(y,m,d,12,14,tzinfo=CT),{},False)
        assert eligible("schedule",EARLY_CRON,datetime(y,m,d,12,20,tzinfo=CT),{},False)
        assert eligible("schedule",EARLY_CRON,datetime(y,m,d,12,50,tzinfo=CT),{},False)
    assert not eligible("schedule",EARLY_CRON,datetime(2026,11,25,15,20,tzinfo=CT),{},False)
    assert not eligible("schedule","normal",datetime(2026,11,26,16,20,tzinfo=CT),{},False)
    assert eligible("schedule","normal",datetime(2026,11,25,15,20,tzinfo=CT),{},False)
    assert not eligible("schedule","normal",datetime(2026,11,25,16,20,tzinfo=CT),{"session":"2026-11-25"},True)
    assert eligible("workflow_dispatch","",datetime(2026,11,26,10,tzinfo=CT),{},True)

def test_targeted_vxn_rejects_stale_future_and_invalid():
    for day,value in [("2026-11-25",38.53),("2026-11-30",33.34),("2026-11-27",float("inf"))]:
        frame=pd.DataFrame({"Close":[value]},index=pd.to_datetime([day]))
        class T:
            def history(self,**kw):return frame
        old=pd.Series([38.53],index=pd.to_datetime(["2026-11-25"]))
        prices={"VXN":old.copy()}
        assert "unavailable" in recover_vxn_close(prices,{},[],date(2026,11,27),lambda _:T(),lambda **kw:frame)
        pd.testing.assert_series_equal(prices["VXN"],old)

def test_targeted_vxn_accepts_only_exact_date():
    frame=pd.DataFrame({"Close":[99.,33.34,22.]},index=pd.to_datetime(["2026-11-25","2026-11-27","2026-11-30"]))
    class T:
        def history(self,**kw):return frame
    prices={"VXN":pd.Series([38.53],index=pd.to_datetime(["2026-11-25"]))};sources={}
    assert "recovered" in recover_vxn_close(prices,sources,[],date(2026,11,27),lambda _:T(),lambda **kw:frame)
    assert list(prices["VXN"])==[38.53,33.34]
    assert "recovery" in sources["VXN"]

def test_published_prior_recovery_and_protection():
    def score(b,a=16):return dict(bearish=b,possible_max=b+16-a,total=16,available=a,complete=a==16)
    markets={m:{"score":score(b,a),"momentum":{},"confirmation":{"components":{}}} for m,b,a in [("sp500",7,16),("nasdaq100",8,15)]}
    prices={"status":"complete","session":"2026-11-27","previous_session":"2026-11-25","spy":{"close":110,"previous_close":100,"change_pct":10},"qqq":{"close":110,"previous_close":100,"change_pct":10}}
    old={"session":"2026-11-27","model_version":"16-point","markets":markets,"price_moves":prices,"signals":{"copper":{"state":"bull","label":"BULLISH","value":None},"vxn":{"state":"na"}},"order":{"shared":["copper"],"sp500":[],"nasdaq100":["vxn"]},"market_insights_history":{"entries":[{"session":"2026-11-25","spy":{"score":10,"available":16,"total":16},"qqq":{"score":10,"available":16,"total":16}}]}}
    old["market_insights_history"]["entries"][0]["spy"]["metrics"]={"signals":{"copper":{"state":"bull","label":"BULLISH","value":None}}}
    old["market_insights_history"]["entries"][0]["qqq"]["metrics"]={"signals":{"vxn":{"state":"bear","label":"BEARISH","value":38.53}}}
    candidate=copy.deepcopy(old)
    use_published_prior(old,candidate)
    assert candidate["markets"]["sp500"]["momentum"]["d1_range"]==[-3,-3]
    assert candidate["markets"]["nasdaq100"]["momentum"]["d1_range"]==[-2,-1]
    assert "copper" not in candidate["signal_changes"]["by_key"]
    assert candidate["published_comparison"]["session"]=="2026-11-25"
    candidate["signals"]["copper"]["state"]="bear"
    result,reason=protect_retry(old,candidate)
    assert result==old and "copper" in reason
    candidate=copy.deepcopy(old)
    result,reason=protect_retry(old,candidate)
    assert result==old and "no additional" in reason
    candidate["signals"]["vxn"]={"state":"bear","value":33.34,"label":"BEARISH"}
    candidate["markets"]["nasdaq100"]["score"]=score(9)
    result,reason=protect_retry(old,candidate)
    assert reason is None and result==candidate
    use_published_prior(old,result)
    assert result["markets"]["nasdaq100"]["momentum"]["d1_range"]==[-1,-1]


def test_independent_backup_obeys_calendar_and_finalization():
    assert eligible("workflow_dispatch","",datetime(2026,11,27,12,45,tzinfo=CT),{},False,"early")
    assert not eligible("workflow_dispatch","",datetime(2026,11,25,12,45,tzinfo=CT),{},False,"early")
    assert not eligible("workflow_dispatch","",datetime(2026,11,27,16,45,tzinfo=CT),{"session":"2026-11-27"},True,"regular")
    assert eligible("workflow_dispatch","",datetime(2026,11,27,16,45,tzinfo=CT),{},False,"regular")
