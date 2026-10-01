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

## Wallets

- **EVM:** MetaMask, Phantom (EVM), Coinbase Wallet, Rabby, Brave and any wallet that announces itself through EIP-6963, with `window.ethereum` as a fallback.
- **Solana:** Phantom, Solflare and Backpack.
- **What a connected wallet does:** shows your address, network and native balance (EVM). You can sign a free message to sign in. The site reconnects silently after a reload and follows account and network switches.
- **Trades stay on the demo ledger,** so a wallet is never asked to send a transaction.
- **Hosting:** wallet extensions inject into normal pages. If you embed the site inside a sandboxed iframe, the extension may not appear there, so host it on its own domain for real wallets.

## License

MIT for the code. See [LICENSE](LICENSE). The background photo is CC BY-SA 4.0; see [CREDITS.md](CREDITS.md).
