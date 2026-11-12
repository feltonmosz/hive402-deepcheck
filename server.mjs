// xampl deep-check — paid x402 endpoint for HIVE402.
// Stock @x402/express middleware + OMNIGATE facilitator (Base USDC).
// NO hand-built transactions: the SDK builds/verifies/settles everything.
// Seller never signs; payTo is the earn wallet (receives Base USDC).
// Price: $0.05/call. Run: node server.mjs (port 4021).
import express from "express";
import { pathToFileURL } from "url";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const PAY_TO = "0x696ea01F03759CE668C923538747239Cf4F45355"; // earn wallet (EVM)
const PRICE = "$0.05";
const NETWORK = "eip155:8453"; // Base
const FACILITATOR = "https://mcp-x402.onrender.com"; // OMNIGATE (SML)

const app = express();
app.use(express.json());

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR });
const server = new x402ResourceServer(facilitator).register(
  NETWORK,
  new ExactEvmScheme(),
);

const accepts = [
  { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO },
];
app.use(
  paymentMiddleware(
    {
      "GET /deep-check": {
        accepts,
        description:
          "Token deep-check: pairs, liquidity, FDV, price action, sellability flags for one token. Query: ?chain=base|bsc|ethereum|solana&address=0x...",
      },
      "POST /deep-check": {
        accepts,
        description:
          "Token deep-check (POST). Body: {chain, address}. Same report as GET.",
      },
    },
    server,
  ),
);

app.get("/", (_req, res) => {
  res.json({
    service: "xampl deep-check",
    price: `${PRICE} USDC per call on Base (x402 v2 exact)`,
    usage: "GET /deep-check?chain=base&address=0x... or POST /deep-check {chain, address}",
    checks: ["dexscreener pairs", "liquidity", "fdv", "24h price change", "sellability flags"],
    not_checked: ["honeypot simulation", "holder distribution", "contract source audit"],
    seller: PAY_TO,
    facilitator: FACILITATOR,
  });
});

async function deepCheck(chain, address) {
  const r = await fetch(
    `https://api.dexscreener.com/tokens/v1/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`,
    { headers: { accept: "application/json" } },
  );
  if (!r.ok) throw new Error(`dexscreener HTTP ${r.status}`);
  const pairs = await r.json();
  if (!Array.isArray(pairs) || pairs.length === 0) {
    return { chain, address, pairs: 0, verdict: "NO_MARKET",
      note: "No DexScreener pairs found — token is unlisted or has no liquidity pool. Unsellable until a pool exists." };
  }
  const sorted = [...pairs].sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  const top = sorted[0];
  const totalLiq = pairs.reduce((s, p) => s + (p.liquidity?.usd || 0), 0);
  const flags = [];
  if (totalLiq < 1000) flags.push("LIQUIDITY_UNDER_$1K");
  if (pairs.length === 1) flags.push("SINGLE_PAIR");
  if ((top.priceChange?.h24 ?? 0) < -50) flags.push("DOWN_OVER_50PCT_24H");
  if (!top.info?.websites?.length && !top.info?.socials?.length) flags.push("NO_LINKS");
  const verdict = totalLiq < 100 ? "DEAD_OR_UNSELLABLE"
    : totalLiq < 1000 ? "THIN_LIQUIDITY"
    : flags.length ? "CAUTION" : "LIQUID";
  return {
    chain, address,
    token: `${top.baseToken?.name || "?"} (${top.baseToken?.symbol || "?"})`,
    pairs: pairs.length, totalLiquidityUsd: Math.round(totalLiq * 100) / 100,
    topPair: { dex: top.dexId, pair: top.pairAddress, priceUsd: top.priceUsd,
      liquidityUsd: top.liquidity?.usd, fdv: top.fdv, h24ChangePct: top.priceChange?.h24,
      h24VolumeUsd: top.volume?.h24, url: top.url },
    flags, verdict,
    note: "Deterministic market-data check only. Not a honeypot test or contract audit.",
  };
}

async function handler(req, res) {
  const chain = (req.query.chain || req.body?.chain || "").toLowerCase();
  const address = req.query.address || req.body?.address || "";
  if (!chain || !address) {
    return res.status(400).json({ error: "need ?chain=&address= (or JSON body)" });
  }
  try {
    res.json(await deepCheck(chain, address));
  } catch (e) {
    res.status(502).json({ error: `upstream failed: ${e.message}` });
  }
}
app.get("/deep-check", handler);
app.post("/deep-check", handler);

export default app;

// Listen only when run directly (`node server.mjs`). When imported by the
// Vercel serverless entry (api/index.mjs), the platform serves the app.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = process.env.PORT || 4021; // hosts assign PORT dynamically; 4021 is the local fallback
  app.listen(PORT, () => console.log(`xampl deep-check listening on :${PORT}`));
}
