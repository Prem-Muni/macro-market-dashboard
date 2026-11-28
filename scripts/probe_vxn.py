"""Read-only public historical-download diagnostic; never publishes a snapshot."""
import requests, pandas as pd, io
from datetime import date
target=pd.Timestamp("2026-11-27")
for host in ("cdn.cboe.com","cdn-api.cboe.com"):
    for symbol in ("VXN","VIX"):
        url=f"https://{host}/api/global/us_indices/daily_prices/{symbol}_History.csv"
        try:
            r=requests.get(url,timeout=20,headers={"User-Agent":"MacroMarketDashboard/0.1 personal-research","Cache-Control":"no-cache"})
            print(f"PROBE {host} {symbol} HTTP={r.status_code} final={r.url} type={r.headers.get('Content-Type')} last_modified={r.headers.get('Last-Modified')} age={r.headers.get('Age')}")
            r.raise_for_status()
            raw=r.text.splitlines()
            start=next(i for i,line in enumerate(raw) if line.strip().lstrip('\ufeff').upper().startswith("DATE,"))
            df=pd.read_csv(io.StringIO("\n".join(raw[start:])))
            df.columns=[str(c).strip().upper() for c in df.columns]
            dates=pd.to_datetime(df["DATE"],errors="coerce")
            close=pd.to_numeric(df["CLOSE"],errors="coerce")
            series=pd.Series(close.values,index=dates).dropna().sort_index()
            print(f"PROBE RESULT {host} {symbol} latest={series.index.max()} target_present={target in series.index} target_close={series.get(target)}")
        except Exception as e:
            print(f"PROBE ERROR {host} {symbol}: {type(e).__name__}: {str(e)[:180]}")
# Compare raw Yahoo dates and close to the Cboe download; no new auth or scraping.
try:
    import yfinance as yf
    for ticker in ("^VXN","^VIX"):
        d=yf.Ticker(ticker).history(period="5d",interval="1d",auto_adjust=False,actions=False,timeout=20)
        print(f"PROBE YAHOO {ticker}: {d[['Close']].tail(3).to_string()}")
except Exception as e:print(f"PROBE YAHOO ERROR {type(e).__name__}: {str(e)[:180]}")
