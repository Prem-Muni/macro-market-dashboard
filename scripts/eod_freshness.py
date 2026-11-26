"""NYSE regular-session date safeguards for the EOD research dashboard.

This calendar covers standard NYSE holidays (not emergency closures).  The
updater never invents missing closes; the dates are used only to refuse a
misleading stale *success* after the scheduled post-close refresh.
"""
from __future__ import annotations
from datetime import date, timedelta, datetime
from dateutil.easter import easter
from zoneinfo import ZoneInfo

CENTRAL = ZoneInfo('America/Chicago')

def nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    first = date(year,month,1)
    return first + timedelta(days=(weekday-first.weekday())%7+7*(n-1))

def last_weekday(year: int, month: int, weekday: int) -> date:
    if month == 12: next_month=date(year+1,1,1)
    else: next_month=date(year,month+1,1)
    last=next_month-timedelta(days=1)
    return last-timedelta(days=(last.weekday()-weekday)%7)

def observed_day(year: int, month: int, day: int) -> date:
    d=date(year,month,day)
    if d.weekday()==5: return d-timedelta(days=1)
    if d.weekday()==6: return d+timedelta(days=1)
    return d

def nyse_regular_holidays(year: int) -> set[date]:
    holidays=set()
    for y in [year-1,year,year+1]:
        holidays.update(observed_day(y,m,d) for m,d in ((6,19),(7,4),(12,25)))
        # NYSE does not always observe a Saturday New Year's Day on Friday;
        # avoid closing a genuine year-end trading session unnecessarily.
        new_year=date(y,1,1)
        holidays.add(new_year if new_year.weekday()<5 else new_year+timedelta(days=1) if new_year.weekday()==6 else new_year)
        holidays.update((nth_weekday(y,1,0,3),nth_weekday(y,2,0,3),
                         last_weekday(y,5,0),nth_weekday(y,9,0,1),nth_weekday(y,11,3,4),
                         easter(y)-timedelta(days=2)))
    return holidays

def is_regular_session(day: date) -> bool:
    return day.weekday()<5 and day not in nyse_regular_holidays(day.year)

# Official NYSE published early-close schedule, 2026–2028.
# https://www.nyse.com/trade/hours-calendars
EARLY_CLOSE_DATES = frozenset(date.fromisoformat(d) for d in (
    "2026-11-27", "2026-12-24", "2027-11-26", "2028-07-03", "2028-11-24",
))

def is_early_close(day: date) -> bool:
    return is_regular_session(day) and day in EARLY_CLOSE_DATES

def eod_cutoff(day: date) -> tuple[int, int]:
    # Equity core-session close plus 15-minute provider buffer, Central time.
    return (12, 15) if is_early_close(day) else (15, 15)

def expected_close(now: datetime | None = None) -> date | None:
    now = now.astimezone(CENTRAL) if now is not None else datetime.now(CENTRAL)
    today=now.date()
    if not is_regular_session(today) or (now.hour,now.minute)<eod_cutoff(today):
        return None
    return today

def check_snapshot_session(current_session: str, prior_session: str | None,
                           now: datetime | None = None) -> None:
    if prior_session and current_session < prior_session:
        raise RuntimeError(f'EOD SESSION REGRESSION: newly fetched session {current_session} is older than saved {prior_session}; retaining saved snapshot.')
    required=expected_close(now)
    if required and current_session < required.isoformat():
        raise RuntimeError(f'EOD DATA NOT READY: provider latest common SPY/QQQ session is {current_session}, expected {required}; retaining saved snapshot. The later backup refresh will retry.')


def most_recent_completed_session(now: datetime | None = None) -> date:
    """Last session past our EOD safety buffer, including before weekends/holidays.

    Used only to repair a previously published incomplete snapshot; does not
    permit a newer intraday session to be published as a completed market day.
    """
    now = now.astimezone(CENTRAL) if now is not None else datetime.now(CENTRAL)
    day = now.date()
    if not is_regular_session(day) or (now.hour, now.minute) < eod_cutoff(day):
        day -= timedelta(days=1)
    while not is_regular_session(day):
        day -= timedelta(days=1)
    return day
