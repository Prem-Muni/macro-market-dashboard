"""UTC cron probes with Central-time eligibility; manual deployments remain available."""
import json, os
from datetime import datetime
from pathlib import Path
from eod_freshness import CENTRAL, expected_close, is_early_close, most_recent_completed_session

EARLY_CRON="20,50 17,18 * 7,11,12 1-5"

def eligible(event, cron, now, saved, finalized, backup_phase="manual"):
    if event=="workflow_dispatch" and backup_phase=="manual":
        return True
    now=now.astimezone(CENTRAL)
    day=expected_close(now)
    early_probe = cron==EARLY_CRON or backup_phase=="early"
    if early_probe and (day is None or not is_early_close(day)):
        return False
    if day is None:
        # A delayed trigger or independent backup can finish the most recent
        # already-published partial EOD; never start a new holiday/weekend day.
        from update import can_repair_vxn
        day=most_recent_completed_session(now)
        return not finalized and can_repair_vxn(saved,day)
    return not (finalized and saved.get("session","")>=day.isoformat())

if __name__=="__main__":
    from update import is_finalized_snapshot
    path=Path("docs/data/latest.json")
    saved=json.loads(path.read_text()) if path.exists() else {}
    publish=eligible(os.environ.get("EVENT_NAME"),os.environ.get("EVENT_CRON"),datetime.now(CENTRAL),saved,is_finalized_snapshot(saved),os.environ.get("BACKUP_PHASE","manual") or "manual")
    with open(os.environ["GITHUB_OUTPUT"],"a") as out:
        out.write("publish="+str(publish).lower()+"\n")
    print("Scheduled EOD eligible" if publish else "No eligible incomplete EOD session; skipping collection and deployment")
