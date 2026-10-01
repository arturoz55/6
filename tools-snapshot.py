#!/usr/bin/env python3
"""Capture a real snapshot of trending Solana tokens for live-snapshot.json.

The site loads live data straight from DexScreener in the browser. This file is
only the fallback for places that block outside requests, such as a sandboxed
preview. Run it again to refresh the snapshot:  python3 tools-snapshot.py
"""
import base64, json, time, urllib.request

DS = "https://api.dexscreener.com"
UA = {"User-Agent": "sharecurve-snapshot/1.0"}

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
out = {"at": int(time.time() * 1000), "boosted": boosted, "fresh": fresh, "pairs": list(best.values()), "images": images}
with open("live-snapshot.json", "w") as f:
    json.dump(out, f, separators=(",", ":"))
print(f"{len(best)} tokens, {len(images)} icons")
