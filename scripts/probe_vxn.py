"""One-off read-only live repair proof: no repository publication."""
import json,sys
from pathlib import Path
from datetime import date
from update import official_cboe,repair_vxn_only
p=Path("docs/data/latest.json")
before=json.loads(p.read_text())
day=date.fromisoformat(before["session"])
series,providers,errors=official_cboe(("VXN",),fresh=True)
after=repair_vxn_only(before,series.get("VXN"),day,providers.get("VXN","Cboe official historical CSV: VXN"))
if after is None:
    print("LIVE REPAIR NOT AVAILABLE",errors)
    sys.exit(1)
assert before["price_moves"]==after["price_moves"]
assert before["markets"]["sp500"]==after["markets"]["sp500"]
assert all(before["signals"][k]==after["signals"][k] for k in before["signals"] if k!="vxn")
assert before["market_insights_history"]["entries"][:-1]==after["market_insights_history"]["entries"][:-1]
print("LIVE REPAIR VERIFIED",after["session"],after["signals"]["vxn"]["value"],after["markets"]["nasdaq100"]["score"],after["markets"]["nasdaq100"]["momentum"],after["markets"]["nasdaq100"]["confirmation"],after["markets"]["nasdaq100"]["swing"])
# Emit only a compact patch derived by the real engine, not the full raw dataset.
keys=["generated_at","repair_metadata","published_comparison","signal_changes","retry_five_day_basis"]
delta={k:after[k] for k in keys if k in after}
delta.update(vxn=after["signals"]["vxn"],nd=after["markets"]["nasdaq100"],source=after["sources"]["VXN"],audit=after["source_audit"]["observations"]["VXN"],history_last=after["history"][-1],archive_last=after["market_insights_history"]["entries"][-1])
# The archive is recreated by the real updater in production, no raw history dump.
print("LIVE PATCH SUMMARY",json.dumps({k:v for k,v in delta.items() if k!="archive_last"},separators=(",",":")))
