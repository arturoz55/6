# Sharecurve

A launchpad for coins quoted in shares of the company behind an app. An Instagram coin trades against META, a YouTube coin against GOOGL. Each coin has a fixed supply of 1B. 800M sell on a constant-product bonding curve, and the pool locks at graduation.

This build runs entirely in the browser on a demo ledger. There's a simulated stock feed, bot traders, and a demo wallet with $10,000 of test funds. A browser wallet can be used to sign in with your address. No real assets move.

## Run

Any static server works:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Features

- Board with live prices, sparklines, graduation progress, and the filters Hot / New / Near graduation / Graduated / Beating stock
- Coin page with a candlestick chart (lightweight-charts) and two-leg buy/sell quotes (USD → stock → coin), fees, price impact, refunds when the curve fills, and live trades
- Launch form: app → pair lookup, creator tax of 0–2%, image upload with square crop, optional first buy, saved draft
- Pairs, Unclaimed apps, Scoreboard (return vs. the paired stock), Watchlist, Two-legs calculator, Account, Treasury, Docs, Security
- Find palette (`/`), currency switch (USD / EUR / GBP / JPY / stock shares), dark and light themes, scrolling ticker tape, MIT license modal

## Live Solana tokens

- **Default board tab:** "Live · Solana" shows real Solana memecoins trading right now, the same tokens that trend on GMGN.
- **Source:** the [DexScreener public API](https://docs.dexscreener.com/api/reference): top boosted tokens, newest token profiles and pair data. Prices, market cap, liquidity, volume and buy/sell counts refresh every 15 seconds.
- **Token page:** candles come from GeckoTerminal. Candles that disagree with DexScreener's price by more than 3x are dropped; if too many disagree, the chart falls back to the live price line. The page links to GMGN, DexScreener and Solscan, and offers paper trading against the live price with demo cash.
- **Why not GMGN directly:** GMGN has no public API, so each token simply links to its GMGN page.
- **Fallback:** when the browser can't reach the APIs (for example inside a sandboxed preview), the site loads `live-snapshot.json`, a real capture, and labels it as a snapshot. Refresh it with `python3 tools-snapshot.py`.

## Zcash (ZEC)

`#/zcash`, plus a spotlight banner on the board:
- **Live data:** price and 24h stats from Coinbase Exchange (Binance as fallback), refreshed every 20 seconds. Candles for 1D, 7D, 30D and 1Y. Live block height from Blockchair.
- **"What the chain sees":** the same payment shown as transparent or shielded.
- **Shielded pools:** Sprout, Sapling and Orchard.
- **Address format checker:** recognises t1, t3, tex1, zs1, u1 and zc addresses.
- **Supply and halvings:** issued supply computed from the block height and the emission schedule (estimate), and the next halving at block 4,406,400.
- **Paper trading** with demo cash.

## Wallets

- **EVM:** MetaMask, Phantom (EVM), Coinbase Wallet, Rabby, Brave and any wallet that announces itself through EIP-6963, with `window.ethereum` as a fallback.
- **Solana:** Phantom, Solflare and Backpack.
- **What a connected wallet does:** shows your address, network and native balance (EVM). You can sign a free message to sign in. The site reconnects silently after a reload and follows account and network switches.
- **Trades stay on the demo ledger,** so a wallet is never asked to send a transaction.
- **Hosting:** wallet extensions inject into normal pages. If you embed the site inside a sandboxed iframe, the extension may not appear there, so host it on its own domain for real wallets.

## License

MIT for the code. See [LICENSE](LICENSE). The background photo is CC BY-SA 4.0; see [CREDITS.md](CREDITS.md).
