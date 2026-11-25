# Findings and decisions — website content audit

| Area | Before | Fix / after |
| --- | --- | --- |
| History header | Current summary injected before History title; repeated again inside | No injected summary on non-Dashboard pages; archive includes previous sessions only |
| Summary archive | Multiple titles and explanatory blocks | One heading, one CSV action, collapsed baseline note |
| Breakdown badges | `3/10 non-bearish`, `2/6 non-bearish` | `3/10 health pts`, `2/6 health pts`; neutral included by scoring convention |
| Signal dates | Not visible in section header | As-of-date from `data.session` on SPY / QQQ / Macro panels |
| RSI display | Conventional `Neutral` for RSI 40 while scorer says bearish | Explicit `Scored bearish` below 45; chart still shows 30/70 context |
| MACD in archive details | Always said `NOT SCORED` | 16-point record = `SCORED`; older = `CONTEXT ONLY` |
| Scoring Guide | Active 16-point paragraph plus legacy 15-point bearish rules | Current 16-point health rules only; 6 shared + 10 for each market |
| Scoring Logic | Duplicated Guide intro plus prior 15-point study | Renamed Model Research; current methodology, limitations; legacy study preserved collapsed |
| Cross-page navigation | Old term `Scoring Logic` | Consistent `Model Research` label; URL unchanged |

**Not changed:** any numerical scoring rule, threshold, MACD computation, Fear & Greed status, historical stored JSON, scheduled workflow, Python market data code, or ThinkScript study.

**Known limitations:** Cannot guarantee live repository matches these previously generated latest packages without pulling from GitHub. Source-provider freshness and the predictive merit of the experimental thresholds remain outside this visual/content audit.
