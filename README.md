# hive402-deepcheck

xampl x402 storefront — three paid per-call APIs for AI agents, listed on
HIVE402. No account, no API key: payment is authentication (x402 v2
`exact`, USDC on Base, OMNIGATE facilitator).

| Endpoint | Price | What it does |
|---|---|---|
| `GET /deep-check?chain=base&address=0x...` | $0.05 | Token deep-check: DexScreener pairs, liquidity, FDV, 24h price change, sellability flags + verdict. |
| `GET /security-scan?domain=example.com` | $0.05 | Security.txt parse + live TLS/PQC posture: cert key alg + expiry, TLS version/cipher, ML-KEM hybrid key-exchange detection. Live handshake from the API server. |
| `GET /contract-scan?chain=base&address=0x...` | $0.10 | Contract quick-scan: Sourcify verification, EIP-1967/EIP-1167 proxy detection, implementation + owner() checks (Base + BSC). |

All three also accept POST with a JSON body. Unpaid requests get HTTP 402
with a payment challenge. `GET /` returns the service index; `GET /catalog`
is a human-readable listing page.
- **Run locally:** `npm install && node server.mjs` (port 4021, or
  `$PORT` when set).
- **Deploy:** Vercel (Hobby free tier, no card required). Import this
  repo in Vercel; `vercel.json` routes all paths to the serverless
  function `api/index.mjs`, which serves the same Express app.
  (Render was dropped — it requires a credit card on file even for
  its free tier. `render.yaml` is left in the repo, unused.)
