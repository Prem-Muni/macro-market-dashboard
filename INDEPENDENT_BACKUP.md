# Independent EOD backup (optional, not activated)

GitHub's scheduled events are best-effort. On 2026-11-27 no scheduled run appeared after the morning; manual dispatch worked. No new external account or trigger has been activated. Use a separate scheduler only after the repository owner approves setup.

## Cloudflare Worker option

Use a free Worker with no HTTP endpoint (disable workers.dev/public route), scheduled UTC triggers, and a secret named GITHUB_TOKEN. Create a **fine-grained** GitHub personal access token limited to this one repository, Actions: Read and write, Metadata: Read, expiration chosen by owner. Never place the token in the repository, public website, source code or a chat. Rotate/revoke when no longer needed. The token's Actions permission is repository-wide, not limited to a single workflow.

Set Cron Triggers:
- `45 17,18 * * 1-5` (early-close backup)
- `45 20,21 * * 1-5` (normal close backup)
- `45 0,1 * * 2-6` (late backup; Friday night is Saturday in UTC)

The Worker uses Central date/time to discard the other daylight-saving probe. The GitHub workflow additionally rejects non-early days, finalized days and ineligible sessions; it may fill the most recent partial VXN gap without generating a holiday/weekend observation. It skips no-change deployments. This independent service still depends on GitHub accepting workflow dispatch and executing the job, so it is a backup, not an availability guarantee.

Paste the following Worker script using Cloudflare's web editor; add the secret in Settings. Do not enable a public route.

```js
export default {
  async scheduled(controller, env) {
    const at = new Date(controller.scheduledTime);
    const local = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone:"America/Chicago", weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
    }).formatToParts(at).map(x=>[x.type,x.value]));
    if (!["Mon","Tue","Wed","Thu","Fri"].includes(local.weekday)) return;
    const phase = {"12":"early","15":"regular","19":"late"}[local.hour];
    if (!phase) return;
    if (!env.GITHUB_TOKEN) throw Error("Missing scoped GitHub secret");
    const response = await fetch("https://api.github.com/repos/Prem-Muni/macro-market-dashboard/actions/workflows/update.yml/dispatches", {
      method:"POST",
      headers:{
        Authorization:"Bearer "+env.GITHUB_TOKEN,
        Accept:"application/vnd.github+json",
        "Content-Type":"application/json",
        "User-Agent":"market-dashboard-backup"
      },
      body:JSON.stringify({ref:"main",inputs:{backup_phase:phase}})
    });
    if (!response.ok) throw Error("GitHub dispatch HTTP "+response.status);
    console.log("GitHub accepted "+phase+" backup dispatch at "+at.toISOString());
  }
};
```

Verify in both Cloudflare invocation logs and GitHub Actions. A successful HTTP response means dispatch accepted, not that EOD was published. Validate one normal session and the next actual early-close session. Do not run extra production refreshes merely to test the scheduler.

References:
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
