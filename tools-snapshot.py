#!/usr/bin/env python3
"""Capture a real snapshot of trending Solana tokens for live-snapshot.json.

The site loads live data straight from DexScreener in the browser. This file is
only the fallback for places that block outside requests, such as a sandboxed
preview. Run it again to refresh the snapshot:  python3 tools-snapshot.py
"""
import base64, json, time, urllib.request

DS = "https://api.dexscreener.com"
UA = {"User-Agent": "kruv-snapshot/1.0"}

def get(url, raw=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
        data = r.read()
        return (data, r.headers.get("content-type", "")) if raw else json.loads(data)

boosts = get(DS + "/token-boosts/top/v1")
profiles = get(DS + "/token-profiles/latest/v1")
sol = lambda xs: list(dict.fromkeys(x["tokenAddress"] for x in xs if x.get("chainId") == "solana"))
boosted = sol(boosts)[:30]
fresh = [a for a in sol(profiles) if a not in boosted][:30]
pairs = []
addrs = boosted + fresh
for i in range(0, len(addrs), 30):
    pairs += get(f"{DS}/tokens/v1/solana/{','.join(addrs[i:i + 30])}")
best = {}
for p in pairs:
    a = p["baseToken"]["address"]
    if a not in best or (p.get("liquidity") or {}).get("usd", 0) > (best[a].get("liquidity") or {}).get("usd", 0):
        best[a] = p
images = {}
for a, p in best.items():
    url = (p.get("info") or {}).get("imageUrl")
    if not url:
        continue
    try:
        data, ctype = get(url.split("?")[0] + "?width=64&height=64&fit=crop&quality=90&format=auto", raw=True)
        if len(data) < 40000 and ctype.startswith("image/"):
            images[a] = f"data:{ctype.split(';')[0]};base64," + base64.b64encode(data).decode()
    except Exception:
        pass
# Zcash: Coinbase price, 24h stats and candles, Blockchair block height
zec = None
try:
    t = get("https://api.exchange.coinbase.com/products/ZEC-USD/ticker")
    st = get("https://api.exchange.coinbase.com/products/ZEC-USD/stats")
    height = get("https://api.blockchair.com/zcash/stats")["data"]["best_block_height"]
    nowms = int(time.time() * 1000)
    candles = {}
    for tf, (g, span) in {"1d": (300, 864e5), "7d": (3600, 7 * 864e5), "30d": (21600, 30 * 864e5), "1y": (86400, 300 * 864e5)}.items():
        start = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime((nowms - span) / 1000))
        rows = get(f"https://api.exchange.coinbase.com/products/ZEC-USD/candles?granularity={g}&start={start}")
        candles[tf] = sorted([[r[0], r[3], r[2], r[1], r[4], r[5]] for r in rows])
        time.sleep(0.4)
    zec = {"at": nowms, "price": float(t["price"]), "open": float(st["open"]), "high": float(st["high"]), "low": float(st["low"]), "vol": float(st["volume"]), "height": height, "candles": candles}
except Exception as e:
    print("zec snapshot failed:", e)
out = {"at": int(time.time() * 1000), "boosted": boosted, "fresh": fresh, "pairs": list(best.values()), "images": images, "zec": zec}
with open("live-snapshot.json", "w") as f:
    json.dump(out, f, separators=(",", ":"))
print(f"{len(best)} tokens, {len(images)} icons")
