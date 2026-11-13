// xampl x402 storefront — three paid endpoints for HIVE402.
// Stock @x402/express middleware + OMNIGATE facilitator (Base USDC).
// NO hand-built transactions: the SDK builds/verifies/settles everything.
// Seller never signs; payTo is the earn wallet (receives Base USDC).
// Endpoints: /deep-check $0.05, /security-scan $0.05, /contract-scan $0.10.
// Run: node server.mjs (port 4021).
import express from "express";
import tls from "node:tls";
import { pathToFileURL } from "url";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const PAY_TO = "0x696ea01F03759CE668C923538747239Cf4F45355"; // earn wallet (EVM)
const PRICE5 = "$0.05";
const PRICE10 = "$0.10";
const NETWORK = "eip155:8453"; // Base
const FACILITATOR = "https://mcp-x402.onrender.com"; // OMNIGATE (SML)

const app = express();
app.use(express.json());

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR });
const server = new x402ResourceServer(facilitator).register(
  NETWORK,
  new ExactEvmScheme(),
);

const accepts5 = [{ scheme: "exact", price: PRICE5, network: NETWORK, payTo: PAY_TO }];
const accepts10 = [{ scheme: "exact", price: PRICE10, network: NETWORK, payTo: PAY_TO }];

app.use(
  paymentMiddleware(
    {
      "GET /deep-check": {
        accepts: accepts5,
        description:
          "Token deep-check: pairs, liquidity, FDV, price action, sellability flags for one token. Query: ?chain=base|bsc|ethereum|solana&address=0x...",
      },
      "POST /deep-check": {
        accepts: accepts5,
        description:
          "Token deep-check (POST). Body: {chain, address}. Same report as GET.",
      },
      "GET /security-scan": {
        accepts: accepts5,
        description:
          "Security.txt + live TLS/PQC posture for one domain. Query: ?domain=example.com. Live handshake from the API server: negotiated TLS/cipher, cert key algorithm + expiry, ML-KEM hybrid key-exchange detection, security.txt parse.",
      },
      "POST /security-scan": {
        accepts: accepts5,
        description:
          "Security.txt + live TLS/PQC posture (POST). Body: {domain}. Same report as GET.",
      },
      "GET /contract-scan": {
        accepts: accepts10,
        description:
          "Contract quick-scan: Sourcify verification + proxy/owner checks. Query: ?chain=base|bsc&address=0x.... Reports verified match, EIP-1967/EIP-1167 proxy detection, implementation + owner() if present.",
      },
      "POST /contract-scan": {
        accepts: accepts10,
        description:
          "Contract quick-scan (POST). Body: {chain, address}. Same report as GET.",
      },
    },
    server,
  ),
);

const CATALOG = [
  { path: "/deep-check", price: "$0.05", method: "GET/POST",
    blurb: "Token deep-check: pairs, liquidity, FDV, 24h price action, sellability flags.",
    usage: "GET /deep-check?chain=base&address=0x..." },
  { path: "/security-scan", price: "$0.05", method: "GET/POST",
    blurb: "Security.txt parse + live TLS/PQC posture: cert key alg + expiry, TLS version/cipher, ML-KEM hybrid key-exchange detection.",
    usage: "GET /security-scan?domain=example.com" },
  { path: "/contract-scan", price: "$0.10", method: "GET/POST",
    blurb: "Contract quick-scan: Sourcify verification, EIP-1967/EIP-1167 proxy detection, implementation + owner() checks (Base + BSC).",
    usage: "GET /contract-scan?chain=base&address=0x..." },
];

app.get("/", (_req, res) => {
  res.json({
    service: "xampl x402 storefront",
    payment: "x402 v2 exact, USDC on Base",
    seller: PAY_TO,
    facilitator: FACILITATOR,
    endpoints: CATALOG,
    catalog: "/catalog",
  });
});

app.get("/catalog", (_req, res) => {
  const rows = CATALOG.map((e) => `
    <section style="border:1px solid #333;border-radius:8px;padding:16px;margin:12px 0">
      <h2 style="margin:0 0 8px"><code>${e.path}</code> &mdash; ${e.price} USDC/call</h2>
      <p style="margin:0 0 8px">${e.blurb}</p>
      <p style="margin:0"><code>${e.usage}</code></p>
      <p style="margin:8px 0 0;color:#888">Method: ${e.method} &middot; Pay with x402 v2 <code>exact</code> on Base (eip155:8453). Unpaid requests get HTTP 402 with a payment challenge.</p>
    </section>`).join("");
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8">
<title>xampl x402 storefront</title></head>
<body style="font-family:system-ui,sans-serif;background:#111;color:#eee;max-width:720px;margin:40px auto;padding:0 16px">
<h1>xampl x402 storefront</h1>
<p>Paid per-call APIs for AI agents. No account, no API key &mdash; payment is authentication (x402 v2, USDC on Base).</p>
${rows}
<p style="color:#888">Seller: <code>${PAY_TO}</code> &middot; Facilitator: OMNIGATE &middot; Listed on <a href="https://hive402.scriptmasterlabs.com" style="color:#8ab4f8">HIVE402</a></p>
</body></html>`);
});

// ---------------------------------------------------------------- deep-check
// (unchanged from v1 — do not modify behaviour)
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

async function deepCheckHandler(req, res) {
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
app.get("/deep-check", deepCheckHandler);
app.post("/deep-check", deepCheckHandler);

// ------------------------------------------------------------- security-scan
const HOST_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function cleanDomain(raw) {
  let d = String(raw || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").split("/")[0].split("?")[0].split("#")[0];
  d = d.replace(/:\d+$/, "").replace(/\.+$/, "");
  return HOST_RE.test(d) ? d : null;
}

function tlsProbeOnce(host, groups, timeoutMs = 7000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const opts = { host, port: 443, servername: host, minVersion: "TLSv1.2" };
    if (groups) opts.groups = groups;
    let sock;
    try {
      sock = tls.connect(opts, () => {
        try {
          const cert = sock.getPeerCertificate(true);
          const cipher = sock.getCipher();
          let eph = null;
          try { eph = sock.getEphemeralKeyInfo(); } catch { /* older Node */ }
          const pk = cert.pubkey;
          let keyAlg = "unknown", keyDetail = null;
          if (pk) {
            keyAlg = pk.asymmetricKeyType || "unknown";
            const det = pk.asymmetricKeyDetails || {};
            if (keyAlg === "rsa") keyDetail = `${det.modulusLength || "?"}-bit`;
            else if (det.namedCurve) keyDetail = det.namedCurve;
          }
          const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
          finish({
            ok: true,
            tlsVersion: sock.getProtocol(),
            cipher: cipher?.name || null,
            cipherStandard: cipher?.standardName || null,
            ephemeralKey: eph ? { type: eph.type, name: eph.name, size: eph.size } : null,
            cert: {
              subjectCN: cert.subject?.CN || null,
              issuer: cert.issuer?.O || cert.issuer?.CN || null,
              validFrom: cert.valid_from || null,
              validTo: cert.valid_to || null,
              daysUntilExpiry: validTo && !isNaN(validTo) ? Math.round((validTo - Date.now()) / 86400000) : null,
              keyAlgorithm: keyAlg,
              keyDetail,
              san: cert.subjectaltname || null,
              fingerprint256: cert.fingerprint256 || null,
            },
          });
        } catch (e) {
          finish({ ok: false, error: `cert parse failed: ${e.message}` });
        } finally {
          try { sock.destroy(); } catch { /* ignore */ }
        }
      });
    } catch (e) {
      finish({ ok: false, error: `connect threw: ${e.message}` });
      return;
    }
    const timer = setTimeout(() => {
      try { sock.destroy(); } catch { /* ignore */ }
      finish({ ok: false, error: "TLS timeout" });
    }, timeoutMs);
    sock.on("error", (e) => { clearTimeout(timer); finish({ ok: false, error: `TLS error: ${e.message}` }); });
    sock.on("secureConnect", () => clearTimeout(timer));
  });
}

async function tlsProbe(host) {
  // Offer the hybrid PQ group first so a capable server negotiates ML-KEM.
  // If this client stack does not know the group name, retry with defaults.
  const first = await tlsProbeOnce(host, ["X25519MLKEM768", "X25519", "secp256r1", "secp384r1"]);
  if (first.ok) return { ...first, pqGroupOffered: true };
  const second = await tlsProbeOnce(host, null);
  if (second.ok) return { ...second, pqGroupOffered: false, pqNote: "client retry without ML-KEM group — hybrid support not tested" };
  return first;
}

async function fetchSecurityTxt(host, timeoutMs = 6000) {
  for (const path of ["/.well-known/security.txt", "/security.txt"]) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetch(`https://${host}${path}`, {
        signal: ctrl.signal, headers: { accept: "text/plain,*/*" }, redirect: "follow",
      });
      clearTimeout(t);
      if (!r.ok) continue;
      const text = (await r.text()).slice(0, 100000);
      return { found: true, url: r.url, path, body: text };
    } catch { /* try next path */ }
  }
  return { found: false };
}

function parseSecurityTxt(text) {
  const out = { contact: [], encryption: [], expires: null, acknowledgments: null,
    policy: null, hiring: null, preferredLanguages: null, canonical: null };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z-]+)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2];
    if (k === "contact") out.contact.push(v);
    else if (k === "encryption") out.encryption.push(v);
    else if (k === "expires") out.expires = v;
    else if (k === "acknowledgments") out.acknowledgments = v;
    else if (k === "policy") out.policy = v;
    else if (k === "hiring") out.hiring = v;
    else if (k === "preferred-languages") out.preferredLanguages = v;
    else if (k === "canonical") out.canonical = v;
  }
  return out;
}

export async function securityScan(domain) {
  const [tlsRes, txtRes] = await Promise.allSettled([tlsProbe(domain), fetchSecurityTxt(domain)]);
  const tls = tlsRes.status === "fulfilled" ? tlsRes.value : { ok: false, error: String(tlsRes.reason) };
  const txt = txtRes.status === "fulfilled" ? txtRes.value : { found: false };
  const parsed = txt.found ? parseSecurityTxt(txt.body) : null;
  let txtStatus = "MISSING";
  let txtExpired = false;
  if (parsed) {
    if (parsed.expires) {
      const exp = new Date(parsed.expires);
      txtExpired = !isNaN(exp) && exp < Date.now();
      txtStatus = txtExpired ? "PRESENT_STALE" : "PRESENT_VALID";
    } else {
      txtStatus = "PRESENT_NO_EXPIRY";
    }
  }
  const ephName = tls.ephemeralKey?.name || "";
  const kex = ephName.includes("MLKEM") ? "HYBRID_ML_KEM"
    : tls.ok ? (tls.pqGroupOffered === false ? "NOT_TESTED" : "CLASSICAL_ONLY")
    : "UNKNOWN";
  const certAlg = tls.cert?.keyAlgorithm || "unknown";
  const certPqc = /ml-dsa/i.test(certAlg) ? "PQC" : "CLASSICAL";
  const findings = [];
  if (!txt.found) findings.push("NO_SECURITY_TXT");
  if (txtExpired) findings.push("SECURITY_TXT_EXPIRED");
  if (parsed && parsed.contact.length === 0) findings.push("SECURITY_TXT_NO_CONTACT");
  if (tls.ok && tls.cert.daysUntilExpiry !== null && tls.cert.daysUntilExpiry < 30) findings.push("CERT_EXPIRES_SOON");
  if (kex === "CLASSICAL_ONLY") findings.push("NO_HYBRID_PQ_KEY_EXCHANGE");
  if (certPqc === "CLASSICAL") findings.push("CLASSICAL_CERT_KEY");
  const verdict = !tls.ok ? "TLS_UNREACHABLE"
    : kex === "HYBRID_ML_KEM" ? "HYBRID_KEX_READY" : "CLASSICAL_ONLY";
  return {
    domain,
    tls,
    securityTxt: txt.found ? { url: txt.url, status: txtStatus, ...parsed } : { status: "MISSING" },
    pqc: { keyExchange: kex, certKey: certPqc },
    findings,
    verdict,
    note: "Live handshake from the API server (not CT data). PQC verdict covers key exchange + leaf cert key only, not signatures on the full chain.",
  };
}

async function securityScanHandler(req, res) {
  const domain = cleanDomain(req.query.domain || req.body?.domain || "");
  if (!domain) {
    return res.status(400).json({ error: "need a valid ?domain=example.com (or JSON body {domain})" });
  }
  try {
    res.json(await securityScan(domain));
  } catch (e) {
    res.status(502).json({ error: `scan failed: ${e.message}` });
  }
}
app.get("/security-scan", securityScanHandler);
app.post("/security-scan", securityScanHandler);

// -------------------------------------------------------------- contract-scan
const CHAINS = {
  base: { id: 8453, rpc: "https://mainnet.base.org", explorer: "https://basescan.org" },
  bsc: { id: 56, rpc: "https://bsc-dataseed.binance.org", explorer: "https://bscscan.com" },
};
// EIP-1967 implementation slot: bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const EIP1167_PREFIX = "0x363d3d373d3d3d363d73"; // minimal proxy prefix (45-byte runtime)
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

async function rpcBatch(rpcUrl, calls, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(rpcUrl, {
      method: "POST", signal: ctrl.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(calls.map((c, i) => ({ jsonrpc: "2.0", id: i + 1, method: c.method, params: c.params }))),
    });
    if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
    const arr = await r.json();
    if (!Array.isArray(arr)) throw new Error("RPC batch returned non-array");
    return arr.map((x) => (x && !x.error ? x.result : null));
  } finally {
    clearTimeout(t);
  }
}

function addrFromWord(hex) {
  if (!hex || typeof hex !== "string" || hex.length < 42) return null;
  const a = "0x" + hex.slice(-40).toLowerCase();
  return a !== ZERO_ADDR ? a : null;
}

export async function contractScan(chain, address) {
  const c = CHAINS[chain];
  const [sfy, rpc] = await Promise.allSettled([
    (async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 9000);
      try {
        // Sourcify API v2 (v1 removed): singular /v2/contract/, no fields param.
        // 200 + match "exact_match"|"match" = verified; 404 + match null = not verified.
        const r = await fetch(`https://sourcify.dev/server/v2/contract/${c.id}/${address}`, {
          signal: ctrl.signal,
          headers: { accept: "application/json", "user-agent": "xampl-x402-contract-scan/1.0 (hive402-deepcheck.vercel.app)" },
        });
        clearTimeout(t);
        const j = await r.json().catch(() => ({}));
        if (r.status === 404 || !j.match) return { verified: false, match: null };
        if (!r.ok) return { verified: null, match: null, error: `sourcify HTTP ${r.status}` };
        return { verified: true, match: j.match, creationMatch: j.creationMatch || null,
          runtimeMatch: j.runtimeMatch || null, verifiedAt: j.verifiedAt || null };
      } catch (e) {
        clearTimeout(t);
        return { verified: null, match: null, error: e.message };
      }
    })(),
    rpcBatch(c.rpc, [
      { method: "eth_getCode", params: [address, "latest"] },
      { method: "eth_getStorageAt", params: [address, EIP1967_IMPL_SLOT, "latest"] },
      { method: "eth_call", params: [{ to: address, data: "0x8da5cb5b" }, "latest"] }, // owner()
      { method: "eth_call", params: [{ to: address, data: "0x5c60da1b" }, "latest"] }, // implementation()
    ]),
  ]);
  const sourcify = sfy.status === "fulfilled" ? sfy.value : { verified: null, match: null, error: String(sfy.reason) };
  const rpcVals = rpc.status === "fulfilled" ? rpc.value : [null, null, null, null];
  const rpcError = rpc.status === "rejected" ? String(rpc.reason) : null;
  const [code, implSlot, ownerRet, implRet] = rpcVals;

  const hasCode = typeof code === "string" && code !== "0x" && code.length > 2;
  const codeSize = hasCode ? (code.length - 2) / 2 : 0;
  const implFromSlot = addrFromWord(implSlot);
  const implFromCall = addrFromWord(implRet);
  const owner = addrFromWord(ownerRet);
  let minimalProxyImpl = null;
  if (hasCode && code.toLowerCase().startsWith(EIP1167_PREFIX) && code.length === 92) {
    minimalProxyImpl = "0x" + code.slice(22, 62).toLowerCase();
    if (minimalProxyImpl === ZERO_ADDR) minimalProxyImpl = null;
  }
  const implementation = implFromSlot || minimalProxyImpl || implFromCall || null;
  const proxyKind = implFromSlot ? "EIP1967"
    : minimalProxyImpl ? "EIP1167_MINIMAL"
    : implFromCall ? "CUSTOM_IMPLEMENTATION_FN"
    : null;

  const findings = [];
  if (!hasCode) findings.push("NO_CODE");
  if (sourcify.verified === false) findings.push("NOT_VERIFIED_ON_SOURCIFY");
  if (sourcify.verified === null) findings.push("SOURCIFY_CHECK_FAILED");
  if (proxyKind) findings.push(`PROXY_${proxyKind}`);
  if (owner) findings.push("OWNER_PRESENT");
  if (rpcError) findings.push("RPC_ERROR");

  const verdict = !hasCode ? "NO_CONTRACT"
    : proxyKind ? (sourcify.verified ? "VERIFIED_PROXY" : "UNVERIFIED_PROXY")
    : sourcify.verified ? "VERIFIED_DIRECT" : "UNVERIFIED_DIRECT";

  return {
    chain, address, chainId: c.id, explorer: `${c.explorer}/address/${address}`,
    sourcify,
    onchain: {
      hasCode, codeSizeBytes: codeSize,
      proxy: proxyKind, implementation,
      owner: owner || null,
      ownerNote: owner ? "owner() returned this address" : "owner() call returned nothing (no owner() or reverted)",
    },
    rpcError,
    findings,
    verdict,
    note: "Quick scan only: verification + proxy/owner surface. Not a full audit — no logic, access-control, or economic review.",
  };
}

async function contractScanHandler(req, res) {
  const chain = (req.query.chain || req.body?.chain || "").toLowerCase();
  const address = req.query.address || req.body?.address || "";
  if (!CHAINS[chain]) {
    return res.status(400).json({ error: "need ?chain=base|bsc" });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: "need a valid ?address=0x... (40 hex chars)" });
  }
  try {
    res.json(await contractScan(chain, address));
  } catch (e) {
    res.status(502).json({ error: `scan failed: ${e.message}` });
  }
}
app.get("/contract-scan", contractScanHandler);
app.post("/contract-scan", contractScanHandler);

export default app;

// Listen only when run directly (`node server.mjs`). When imported by the
// Vercel serverless entry (api/index.mjs), the platform serves the app.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = process.env.PORT || 4021; // hosts assign PORT dynamically; 4021 is the local fallback
  app.listen(PORT, () => console.log(`xampl x402 storefront listening on :${PORT}`));
}
