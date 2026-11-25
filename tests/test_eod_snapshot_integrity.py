import importlib, sys, copy
from pathlib import Path
from datetime import date,datetime
from zoneinfo import ZoneInfo
import pytest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from snapshot_integrity import check_completed_snapshot
from update import is_same_session_quality_regression
from eod_freshness import expected_close, most_recent_completed_session


def fixture(available=16, date_='2026-11-25'):
    p1,p2=712.25,644.0
    pprev1,pprev2=718.78,638.10
    return {'session':date_, 'model_version':'16-point-health-v2-macd-neutral-6-10',
      'price_moves':{'status':'complete','session':date_,'previous_session':'2026-11-24',
       'spy':{'close':p1,'previous_close':pprev1,'change_pct':round((p1/pprev1-1)*100,5)},
       'qqq':{'close':p2,'previous_close':pprev2,'change_pct':round((p2/pprev2-1)*100,5)}},
      'moving_averages':{'spy':{'as_of':date_,'close':p1},'qqq':{'as_of':date_,'close':p2}},
      'markets':{'sp500':{'score':{'available':available,'total':16}},'nasdaq100':{'score':{'available':available,'total':16}}}}

def test_verified_price_passes():check_completed_snapshot(fixture(),date(2026,11,25))
def test_unavailable_prices_block():
    v=fixture();v['price_moves']['status']='awaiting_close'
    with pytest.raises(RuntimeError,match='no complete'):check_completed_snapshot(v,date(2026,11,25))
def test_missing_qqq_close_blocks():
    v=fixture();v['price_moves']['qqq']['close']=None
    with pytest.raises(RuntimeError,match='QQQ'):check_completed_snapshot(v)
def test_stale_technical_date_blocks():
    v=fixture();v['moving_averages']['qqq']['as_of']='2026-11-24'
    with pytest.raises(RuntimeError,match='Technicals date'):check_completed_snapshot(v)
def test_mismatched_technical_close_blocks():
    v=fixture();v['moving_averages']['spy']['close']+=1
    with pytest.raises(RuntimeError,match='Technicals close'):check_completed_snapshot(v)
def test_missing_breadth_not_falsely_marked_full():
    v=fixture(available=15)
    check_completed_snapshot(v)
def test_qqq_pct_mismatch_blocks():
    v=fixture();v['price_moves']['qqq']['change_pct']=3
    with pytest.raises(RuntimeError,match='percent change'):check_completed_snapshot(v)
def test_recovered_prices_override_old_partial_score():
    old=fixture(16);old['price_moves']['status']='awaiting_close'
    new=fixture(15)
    assert not is_same_session_quality_regression(old,new)
def test_verified_prior_cannot_be_replaced_by_less_complete():
    assert is_same_session_quality_regression(fixture(16),fixture(15))
def test_preserve_different_model_without_quality_override():
    old=fixture(16);old['model_version']='legacy-15'
    assert not is_same_session_quality_regression(old,fixture(15))
def test_holiday_no_new_session():
    assert expected_close(datetime(2026,11,26,18,0,tzinfo=ZoneInfo('America/Chicago'))) is None
def test_weekday_pre_close_no_new_session():
    assert expected_close(datetime(2026,11,25,13,0,tzinfo=ZoneInfo('America/Chicago'))) is None
def test_trading_day_after_close_is_expected():
    assert expected_close(datetime(2026,11,25,15,20,tzinfo=ZoneInfo('America/Chicago')))==date(2026,11,25)


def test_thanksgiving_repair_target_is_wednesday():
    assert most_recent_completed_session(datetime(2026,11,26,18,0,tzinfo=ZoneInfo('America/Chicago'))) == date(2026,11,25)

def test_before_friday_early_close_no_wrong_session():
    assert most_recent_completed_session(datetime(2026,11,27,11,0,tzinfo=ZoneInfo('America/Chicago'))) == date(2026,11,25)
