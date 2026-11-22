# Breadth Upgrade — experimental, automatic constituent estimates

**What has changed:** After the normal ETF/macro data download, the daily workflow now attempts to
retrieve current constituent lists for the S&P 500 and Nasdaq-100 from public Wikipedia tables,
then their adjusted stock-price histories using the unofficial Yahoo Finance/yfinance interface.
When >=95% of the members have complete and suitable history, the updater derives:

* S&P breadth: **percentage of covered constituents above their own 200-session SMA**.
  The existing 1D/5D breadth and 200D level labels use that single estimated series.
* Nasdaq breadth: count of covered Nasdaq-100 securities closing up or down compared
  with the previous session, which feeds the existing 1D and 5D rules.

**It is not an official Nasdaq/SPX market breadth feed.** The public-market symbols, latest
membership, price-adjustment choices, and data gaps can differ from Thinkorswim.
The inputs are *estimates* and labeled as such in the website; missing or incomplete
observations stay `N/A`.  The history is recomputed with **today's** constituent list,
so it has survivorship bias and is **not suitable for historical backtesting**.

This feature requires about 200+ trading sessions of history for hundreds of stocks.
It is intentionally conservative: if fewer than 95% have suitable history, the
website **does not substitute a partial sample**. Free provider rate limits or Wikipedia
HTML changes can make these estimates unavailable; the daily site still deploys
and the original scores' missing-data safeguards remain intact. Put/call data is still `N/A`.

**Free hosting versus market-data rights:** GitHub Pages/Actions can be free for a
public repository, but a quote being publicly downloadable does not grant publication
rights. Check Yahoo/Wikipedia terms and permitted redistribution before making
constituent-derived readings public. For strictly licensed data, connect your own
provider using the existing supplemental CSV mechanism. Provided authorized
supplemental values **take priority** over derived estimates.

**To turn off the experimental download:** Add a repository Actions variable
`DISABLE_EXPERIMENTAL_BREADTH` with value `1`, or set the workflow step's
environment variable accordingly (see `scripts/update.py`). Without it, the
feature is enabled by default.

**How to deploy this upgrade without losing the live data:** Copy only the files
from the *patch ZIP* into the **root** of the existing GitHub Desktop clone.
Overwriting `scripts/update.py`, `scripts/engine.py`, `docs/app.js`, `requirements.txt`
and `README.md` is intentional. The patch does **not** include `docs/data/latest.json`.
Commit, push, then run the workflow manually once to verify that the broader
unofficial data fetches are permitted and sufficiently complete.

---

# Macro Decision Dashboard — SP500 + Nasdaq-100 (automatic website starter)

**A deployable personal-research website, not a copy of a Thinkorswim feed.**

- **Front end:** mobile-friendly static HTML/CSS/JS under `docs/`.
- **Daily updater:** Python under `scripts/`, with a GitHub Actions job after the US market close.
- **Hosting:** GitHub Pages using the free public-repository option.
- **Data sources:** Cboe official historical downloads for VIX-series where accessible; Yahoo Finance via **unofficial** `yfinance` for daily ETF/futures/index series. Quotes from these sources can be delayed, throttled, unavailable, or subject to use/display restrictions. **Review the terms and get appropriate rights before making market-derived output public.**
- **No guessed readings.** Specialized unavailable inputs show `N/A`. Score range reflects missing points.

## Quick deployment (GitHub; no server or account credentials in the code)

1. Create a **public** GitHub repository called `macro-market-dashboard`. (A public Pages site is accessible to anyone.)
2. Unzip this project and upload **all files, including `.github/workflows/update.yml`**, preserving the folder structure. Use GitHub web **Add file → Upload files**, or `git` on your computer. Some file browsers hide dot folders; check that `.github` uploaded.
3. Open the repository's **Settings → Pages → Build and deployment → Source → GitHub Actions**. This script publishes with `actions/deploy-pages`, not “Deploy from a branch.”
4. Open **Settings → Actions → General**. Allow GitHub Actions to run and, if your repo settings require it, grant workflow `GITHUB_TOKEN` **read/write contents** permissions for the data commit. The workflow declares `contents: write`, `pages: write` and `id-token: write`.
5. Go to **Actions → Refresh EOD dashboard → Run workflow**. Watch that the job downloads data, writes `docs/data/latest.json`, commits the refreshed snapshot, and deploys the website. A first run may fail due to upstream throttling; inspect the job log.
6. When the job succeeds, the **Pages URL** appears in **Settings → Pages** and in the deployment step. It will look like `https://YOURUSERNAME.github.io/macro-market-dashboard/`.
7. Scheduled refresh runs **weekdays at 23:30 UTC**, equivalent to **6:30pm EST** or **7:30pm EDT**, after the normal 4pm US equity close. The schedule is approximate: GitHub may delay or skip scheduled jobs under load and upstream sources may publish later. Use the **Refresh** button on the page to reload the most recently published snapshot; it does *not* trigger a new data collection. To fetch again, manually run the GitHub Action.

### Data privacy and licensing

GitHub Pages is **public**. Do not publish brokerage account details, API keys, passwords, private trades, or licensed market datasets you cannot redistribute. Avoid assuming a free-to-download price is free to republish. The website outputs derived statuses and limited values, but even derived distribution can have license conditions. For a private research workflow, keep the source and calculations in a private environment and use a hosting solution compatible with your provider licenses.

### What works automatically from free-access / unofficial research sources?

| Indicator | Website automated source | Exactness versus Thinkorswim |
|---|---|---|
| VIX, VXN, VIX3M | Cboe historical CSV, Yahoo fallback | Generally close EOD; publication lags and revisions possible |
| SPY / QQQ, sector ETFs, HYG/IEF, RSP, QQQE, IWM, SMH | Yahoo Finance via `yfinance` | Approximate daily close; prices and adjustments can differ |
| Oil `/CL` | Yahoo `CL=F` continuous futures proxy | **Not** guaranteed identical to ToS `/CL` roll or session |
| Copper `/HG` | Yahoo `HG=F` continuous futures proxy | **Not** guaranteed identical to ToS `/HG` |
| Dollar `/DX` | Yahoo `DX-Y.NYB` or `UUP` fallback | UUP is an ETF **proxy**, not the dollar futures contract |
| 10Y Treasury yield `TNX:CGI` | Yahoo `^TNX` | May differ in unit conventions; directional test uses change only |
| SPX put/call `$PCSP` | **N/A** until separately provided | Not substituted with Cboe's all-index put/call |
| NDX put/call `$PCND` | **N/A** until separately provided | Not substituted with generic Nasdaq put/call |
| SPX 200D breadth `$SPXA200R` | **N/A** until separately provided | Requires actual index constituent breadth history |
| Nasdaq-100 `$ADVND/$DECLND` | **N/A** until separately provided | Requires genuine Nasdaq-100 issue counts |

> **Important:** This is an *automatically updating partial dashboard* out of the box. A guaranteed **full 15/15 SPY and 15/15 Nasdaq** website is **not realistically possible from dependable free public APIs alone** using exactly the Thinkorswim indicators. Filling those four specialized input families needs a licensed or otherwise authorized data source; the site never invents them.

## Add an authorized supplemental data source (optional)

When you have licensed access to the exact specialty series, supply a daily CSV with headers:

```csv
date,SPX_PCR,NDX_PCR,SPX_BREADTH200,NDX_ADV,NDX_DECL
2026-11-20,0.92,1.02,46.2,48,52
```

That line is a **format illustration only**, NOT actual values. Do **not** paste those sample values into the project as market readings.

- `SPX_BREADTH200`: the **percentage number 46.2**, not `0.462` and not a decimal fraction.
- `NDX_ADV` and `NDX_DECL`: Nasdaq-100 daily advancing/declining issue counts, **not Nasdaq Composite** counts.
- Series have to align to *trading session dates* for accurate comparison.
- Either add `inputs/supplemental.csv` to the repository (public: mind licensing), or configure a GitHub Actions repository secret named `SUPPLEMENTAL_DATA_URL` with an authorized HTTPS endpoint that returns the CSV (don't commit a private URL). The latter still exposes derived results on a public site; check allowed use.
- The script does **not** fetch proprietary Thinkorswim `$PCSP`, `$PCND`, `$SPXA200R`, `$ADVND`, or `$DECLND` automatically from your brokerage account.

## Exact signal thresholds ported from the source script

Every scored signal is 1 if bearish, 0 otherwise, *when valid*.

**Shared by BOTH scores (6):** Oil up; Dollar up; 10Y yield up; HYG 1D % return below IEF; copper down; VIX/VIX3M above 1.00 (backwardation).

**SP500-specific (9):** VIX above 20; SPX put/call above 1; defensive-sector average 10D return above SPY; XLE 10D return above SPY; SMH below 20 EMA; SPY below 200D SMA; RSP/SPY ratio more than 0.25% below its 10D SMA; IWM/SPY likewise; and S&P 200D breadth participation decreases by at least 1 percentage point in one day.

**Nasdaq-100-specific (9):** VXN above 25; NDX put/call above 1; defensive-sector basket above QQQ in 10D returns; XLE above QQQ in 10D returns; SMH below 20 EMA; QQQ below 200D SMA; QQQE/QQQ and IWM/QQQ ratios >0.25% below 10D SMA; Nasdaq-100 advancing share below 45%.

**SPX breadth informational:** 5-day change ±2 percentage points and level green at 60%+ / red below 40%. **Nasdaq breadth informational:** difference between adjacent 5-day averages of daily advancing share (±5 percentage points). These use **different methodologies**.

- **Risk:** 0–4 RISK-ON, 5–7 CAUTION, 8–15 RISK-OFF, but ONLY when all missing signals cannot change the classification. Example: 6 known bearish, 2 inputs missing → **INCOMPLETE** (could be CAUTION or RISK-OFF). 9 known bearish, 2 missing → conclusively RISK-OFF.
- **5D trend:** bearish points today minus five trading sessions earlier. ≥+2 DETERIORATING, ≤-2 IMPROVING, otherwise STABLE; shown only when the same feeds are present at both endpoints. Scores with missing inputs are still marked **partial**.
- **Confirmation (4 categories):** volatility down 5D (VIX for SPY, VXN for Nasdaq); HYG/IEF ratio up 5D; breadth improving (SPX breadth ≥+2pp; Nasdaq advancing-share 5D averages ↑≥5pp); index price up 5D. Each category is reported as true/false/unknown, not made up.
- **Swing Environment:** BULLISH requires score ≤4, five-day score not up ≥2, confirmation ≥3/4 and index not below 200D SMA; EARLY IMPROVEMENT for score ≥8, 5D score improving ≥2 and confirmation ≥2/4; BEARISH for remaining score ≥8; DETERIORATING for 5–7 and a 5D score increase ≥2; otherwise SELECTIVE. **If score, five-day trend, or four confirmations are incomplete: N/A.**
- **Washout:** an SPX/NDX put/call of 1.35 or more appears yellow **WASHOUT?** but still adds a bearish point, as in the ThinkScript.

## Limitations versus the original script

The research website uses common SPY/QQQ trading sessions (excluding Sunday-only futures bars) and reproduces **the intended daily-bar logic**, not the execution engine of Thinkorswim. Price differences may arise from continuous future contracts, vendor EOD timestamps, close vs settlement prices, Nasdaq symbol definitions, weekends/holidays, adjusted vs unadjusted ETF prices, stale feeds, and moving-average initialization. Volume, breadth and proprietary sentiment series are **not** filled by unrelated proxies. Do not assume online score and Thinkorswim score will match exactly. Check dates, missing signals, symbols, and sources before using for any capital allocation decision.

## Local run / test

```bash
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python scripts/update.py
python -m http.server 8000 --directory docs
```

Then visit `http://localhost:8000`. Tests use **synthetic values marked test-only**, never displayed as live market data. `update.py` does require internet, so it cannot be validated offline against Yahoo/Cboe.

## File map

```
.github/workflows/update.yml  # Scheduled fetch, commit snapshot, deploy Pages
scripts/update.py            # Data acquisition and publishing
scripts/engine.py            # Exact signal engine + incomplete-score safeguards
docs/index.html              # Dashboard page
docs/styles.css              # Responsive visual styles
docs/app.js                  # Rendering and historical scores
docs/data/latest.json        # Starts empty; auto-generated on first run
reference/Thinkorswim_Combined_Source.txt # Your latest original code for reconciliation
inputs/supplemental.example.csv # CSV header template; no fake prices
```

## Future improvements

Switch from provisional price data to a licensed provider with explicit display rights, audit discrepancies against Thinkorswim, and backtest swing-trade outcomes. Be cautious about correlated risk signals and do not treat the dashboard as an automatic all-cash/all-invested system.
