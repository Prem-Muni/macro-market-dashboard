"""UTC cron probes with Central-time eligibility; manual deployments remain available."""
import json, os
from datetime import datetime
from pathlib import Path
from eod_freshness import CENTRAL, expected_close, is_early_close

EARLY_CRON="20,50 17,18 * 7,11,12 1-5"

def eligible(event, cron, now, saved, finalized):
    if event=="workflow_dispatch":
        return True
    now=now.astimezone(CENTRAL)
    day=expected_close(now)
    if day is None or (cron==EARLY_CRON and not is_early_close(day)):
        return False
    return not (finalized and saved.get("session","")>=day.isoformat())

if __name__=="__main__":
    from update import is_finalized_snapshot
    path=Path("docs/data/latest.json")
    saved=json.loads(path.read_text()) if path.exists() else {}
    publish=eligible(os.environ.get("EVENT_NAME"),os.environ.get("EVENT_CRON"),datetime.now(CENTRAL),saved,is_finalized_snapshot(saved))
    with open(os.environ["GITHUB_OUTPUT"],"a") as out:
        out.write("publish="+str(publish).lower()+"\n")
    print("Scheduled EOD eligible" if publish else "No eligible incomplete EOD session; skipping collection and deployment")
