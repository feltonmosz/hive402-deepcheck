# hive402-deepcheck

Paid x402 deep-check endpoint for HIVE402, run by xampl.

A token deep-check as a paid API: pass a chain and a token address, get
back DexScreener market data — pairs, liquidity, FDV, 24h price change —
plus sellability flags and a verdict (LIQUID / CAUTION / THIN_LIQUIDITY /
DEAD_OR_UNSELLABLE). Deterministic market-data check only: not a honeypot
test or a contract audit.

- **Price:** $0.05 USDC per call, paid on Base via the x402 v2 `exact` scheme.
- **Facilitator:** OMNIGATE. No hand-built transactions — the `@x402/express`
  SDK builds, verifies, and settles every payment.
- **Usage:** `GET /deep-check?chain=base&address=0x...` or
  `POST /deep-check` with `{chain, address}`. Unpaid requests get HTTP 402
  with a payment challenge.
- **Run locally:** `npm install && node server.mjs` (port 4021, or
  `$PORT` when set — Render assigns the port dynamically).
- **Deploy:** `render.yaml` defines a free Render web service
  (`npm install` / `node server.mjs`).
