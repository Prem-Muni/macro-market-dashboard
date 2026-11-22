# MacroDecisionDashboard — safer summaries and put/call references

This ZIP updates **your existing** `macro-market-dashboard` GitHub Pages project. It is a **patch**, not a new website. It deliberately does **not** include `docs/data/latest.json`, so your published snapshot and history are not overwritten by installing it.

## What changed

1. **Swing Environment despite one missing put/call ratio:** If the score is `10–11/15` and every plausible missing-data outcome leads to `BEARISH`, the site now shows `BEARISH`, not `N/A`. Conversely, if the outcomes disagree, it still shows `N/A`. Other classification rules and score thresholds are unchanged.
2. **Market Confirmation:** `0/4 available` was misleading. It now reads `0/4 IMPROVING` when four categories have valid data, or `1/3 improving · 3/4 checked` if only three categories are available. The four categories are volatility, credit, breadth, and index price over five sessions.
3. **ETF relative-strength labels:** RSP/SPY, IWM/SPY, QQQE/QQQ, and IWM/QQQ now show their relative difference *from their 10-day ratio SMA* as `+2.02%`, not an ambiguous `2.02`.
4. **Score Trend safeguards:** With a missing indicator on either comparison date, the displayed one-day and five-day differences now show a **range** of feasible changes. `DETERIORATING` / `IMPROVING` / `STABLE` appears only if **all** values in that range agree. Otherwise, the label is `UNCERTAIN` rather than a potentially misleading fixed direction. A missing historical day gives `N/A`.
5. **Put/call reference links:** SPX and NDX P/C rows now link to independently published data pages for *manual research*. **The website does not scrape these pages or include them automatically in the score.** The two readings remain `N/A` until an authorized feed is connected. The Cboe SPX-complex ratio is not assumed identical to Thinkorswim `$PCSP`; other providers' NDX ratios may not match `$PCND` either.
6. **More resilient GitHub Actions publish:** The updater can still deploy the generated website if the optional commit of `latest.json` is rejected due to another commit landing on GitHub. It attempts a safe rebase; **it never force-pushes**. It logs a warning if saving the repository history remains unsuccessful.

## How to install (Mac + GitHub Desktop)

1. In GitHub Desktop, open the `macro-market-dashboard` repository and select **Fetch origin / Pull origin** if offered. This pulls the latest automatic dashboard snapshot before you edit, reducing merge conflicts.
2. Click **Show in Finder** to open the *exact* local repository folder.
3. Extract this upgrade ZIP in Downloads. Open its folder, select **all its contents**, copy, and paste into the repository folder. When macOS asks, **Merge folders**; replace individual matching files. Do not delete `.git`, your `docs/data` folder, or other website files.
4. In GitHub Desktop, inspect the **Changes** list. You should see modifications to `scripts/engine.py`, `docs/app.js`, `docs/index.html`, `docs/styles.css`, `.github/workflows/update.yml`, and `tests/test_engine.py`, plus this guide. The patch includes no latest.json.
5. Commit with `Improve risk summaries and add put-call references`, then **Push origin**.
6. Go to your GitHub repository > **Actions** > **Refresh EOD dashboard** > green **Run workflow** on `main`. Avoid re-running an old job after code changes.
7. After a green check, refresh your website: `https://prem-muni.github.io/macro-market-dashboard/`. Confirm the timestamp advanced and all data labels appear.

## Put/call market data plan — free access vs public reuse

Sources researched November 21, 2026:

- **SPX options:** Cboe's [U.S. options daily statistics](https://www.cboe.com/markets/us/options/market-statistics/daily) publishes an SPX+SPXW(+SPXO) put/call *volume* ratio. It is publicly viewable, but [Cboe's use-of-content rules](https://www.cboe.com/use-of-content) require permission for reuse/public display. We have **not** set up automatic copying to your public GitHub Pages site. Moreover, the combined Cboe product group may differ from Thinkorswim's `$PCSP`.
- **NDX options:** [Obelion](https://www.obelion.net/options/NDX/put-call-ratio) displays an NDX put/call volume ratio, and [Options Analysis Suite](https://www.optionsanalysissuite.com/index/ndx/volume-history) publishes recent volume history. Public visibility does **not** establish redistribution, automated collection, or data licensing rights. Exact methodology and dates may differ from `$PCND`.
- **Best automated route:** obtain a provider that explicitly allows automated access and public display of **daily SPX and NDX options P/C volume ratios**. If you obtain such a feed, the current updater accepts a date-indexed CSV via a GitHub Actions secret called `SUPPLEMENTAL_DATA_URL`, with fields `date,SPX_PCR,NDX_PCR` and optional breadth fields. The source must supply historical observations for accurate 5-day trend calculations; avoid republishing a protected vendor URL or secret.

Do not infer that free website hosting grants free market-data redistribution rights. Until authorized, the site is intentionally explicit about missing input instead of inventing or using an unapproved proxy.

## Checks and interpretation

- **Score stays 15 points per index** and risk cutoffs remain `0–4 RISK-ON`, `5–7 CAUTION`, `8–15 RISK-OFF`.
- **Example:** score 10–11/15, 5D change +3 to +5, confirmation 0/4: the site can safely label `SWING ENV: BEARISH`.
- **Another example:** observed 5D change +1 with one missing signal at each date might really be anywhere between 0 and +2; the site labels `SCORE TREND: UNCERTAIN` instead of incorrectly claiming stability.
- The site uses **estimated constituent breadth**, not official exchange breadth, and its price history depends on public unofficial sources. Compare several daily snapshots with your Thinkorswim reference before using this to determine trade exposure.
- `Refresh` on the website reloads the latest published JSON; **it does not run GitHub Actions**.
- If a workflow displays a red X, open the failed step. In particular, if the daily JSON commit fails due to a conflicting remote commit, the updated workflow should still publish the website but will log a warning.

## What is changed, and not changed

Changed: `docs/app.js`, `docs/index.html`, `docs/styles.css`, `scripts/engine.py`, `.github/workflows/update.yml`, and `tests/test_engine.py`.

Not changed: live market-data fetching, `scripts/breadth.py`, indicator cutoffs, other calculation formulas, or `docs/data/latest.json`.

Tests: `python -m unittest discover -s tests -v` and `node --check docs/app.js` (if Node is installed).
