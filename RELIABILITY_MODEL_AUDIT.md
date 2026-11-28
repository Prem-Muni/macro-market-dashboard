# Reliability and model audit — 2026-11-27

## Scope and findings
- Main overview history previously displayed recalculated 16-point scores while the archive retained the actual recorded 15-/16-point observations. The Nov 25 saved SPY/QQQ scores are both 6/16; the reconstructed scores are both 5/16. The Nov 27 saved and current scores match at 9/16 and 7/16.
- The dashboard now defaults to saved history, with a separately selected reconstructed research series. Neither data series is overwritten. Future five-session momentum uses the same-date complete 16-point saved anchor when available for both ETFs; otherwise retains the original reconstructed basis and labels it. A legacy 15-point anchor is not silently compared as a 16-point record. Existing finalized observations remain unchanged.
- The 20-week validation is descriptive, not a proven strategy. It uses today's constituent membership, reconstructed signals, close-to-close returns and overlapping outcomes. The new audit checks expected trading dates, preserves the baseline, reports a common non-overlapping subset across regimes, and pairs signal-close and delayed next-session-close results on identical eligible signal dates. Emergency closures are not modeled; missing expected price dates invalidate windows. Results appear on the next full build, not a targeted VXN repair. No threshold or individual signal rule was changed.
- At 5 sessions, the existing results show SPY Risk-On 33.3% positive (27), Risk-Off 75% (8); QQQ Risk-On 40% (25), Risk-Off 45.5% (11). The sample is insufficient for threshold conclusions. Keep the fixed rules and saved-only prospective study through Dec 31; report the mature outcomes after each holding period has elapsed.

## Source reconciliation
Nov 27, 2026: prior conversation's transcription of user's Thinkorswim 12:45 PM Central screenshot, compared with saved website observations. This is not an independent retrieval of that screenshot or a live brokerage feed.

| Input | Thinkorswim (reported) | Website | Status |
|---|---:|---:|---|
| SPY health | 9/16 | 9/16 | matches |
| QQQ health | 7/16 | 7/16 | matches |
| VIX | 23.81 | 23.81 | matches; Yahoo fallback |
| VXN | 33.34 | 33.34 | matches; Cboe historical exact-date |
| SPY RSI | 45.04 | 45.04 | matches to 2 decimals |
| QQQ RSI | 44.01 | 44.01 | matches to 2 decimals |
| SPY MACD histogram | -1.54 | -1.54 | matches to 2 decimals |
| QQQ MACD histogram | -0.92 | -0.92 | matches to 2 decimals |
| SPY 5D health change | +7 | +6 | difference; reconstructed anchor |
| QQQ 5D health change | +3 | +2 | difference; reconstructed anchor |
| Crude oil | not available | -0.72% | Yahoo CL=F; settlement unverified |
| Copper | not available | +5.03% | Yahoo HG=F; settlement unverified |
| S&P breadth | not available | 99.2% constituent coverage | estimated, not official $SPXA200R |
| Nasdaq breadth | not available | 97.0% constituent coverage | estimated, not official $ADVND/$DECLND |

Reference/Thinkorswim_Combined_Source.txt contains older put/call-era scoring; it is not proof of the current brokerage script. Obtain the exact current installed study and settings before claiming rule parity. The November 25 16-point study is referenced in earlier project work. Futures close/settlement and roll conventions may differ; check same contract, session date, settlement versus last trade, and adjustment policy. Breadth membership and adjustment conventions may differ. Do not swap vendors or change scores to force agreement.

## Scheduled refresh acceptance
Cloudflare setup is in INDEPENDENT_BACKUP.md. No external scheduler is activated until the owner deploys the worker and installs the repository-scoped secret. Check the Nov 30 regular session after the primary scheduled and first backup windows. Verify event type, generation, deployment, public JSON session, 16/16 coverage, VXN date, and matching archive scores. A successful manual run does not prove automatic scheduling. The existing scheduled gate skips completed snapshots, so if the JSON was saved but Pages deployment failed, verify deployment independently and manually dispatch to republish if necessary.
