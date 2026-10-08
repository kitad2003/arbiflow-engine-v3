"use strict";
// Manual, read-only network identity checks. No transaction submission.
const CONFIG = Object.freeze({
  ronin: { vm: "evm", env: "RONIN_RPC_URL", expected: "0x7e4" },
  monad: { vm: "evm", env: "MONAD_RPC_URL", expected: "0x8f" },
  solana: { vm: "solana", env: "SOLANA_RPC_URL", expected: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" },
  sui: { vm: "sui-graphql", env: "SUI_GRAPHQL_URL", expected: null },
});
const SUI_DEFAULT_GRAPHQL = "https://graphql.mainnet.sui.io/graphql";
function expectedFor(key) {
  if (key === "monad") return process.env.MONAD_CHAIN_ID || CONFIG.monad.expected;
  if (key === "solana") return process.env.SOLANA_GENESIS_HASH || CONFIG.solana.expected;
  if (key === "sui") return process.env.SUI_CHAIN_IDENTIFIER || null;
  return CONFIG[key].expected;
}
function endpointFor(key) {
  return key === "sui" ? (process.env.SUI_GRAPHQL_URL || SUI_DEFAULT_GRAPHQL) : process.env[CONFIG[key].env];
}
function phase6Config() {
  return Object.entries(CONFIG).map(([key, c]) => ({
    key, vm: c.vm, environmentVariable: c.env,
    configured: Boolean(endpointFor(key)),
    expectedIdentifierConfigured: Boolean(expectedFor(key)),
  }));
}
async function postJson(url, body) {
  let parsed;
  try { parsed = new URL(url); } catch { throw Error("INVALID_RPC_URL"); }
  if (parsed.protocol !== "https:" && !(process.env.NODE_ENV === "test" && parsed.hostname === "localhost")) {
    throw Error("HTTPS_REQUIRED");
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8500);
  try {
    const response = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: ctl.signal,
    });
    if (!response.ok) throw Error("HTTP_" + response.status);
    let data;
    try { data = await response.json(); } catch { throw Error("NON_JSON_RESPONSE"); }
    return data;
  } finally { clearTimeout(timer); }
}
async function phase6Probe(key) {
  const c = CONFIG[key];
  if (!c) return { key, status: "UNKNOWN_CHAIN" };
  const url = endpointFor(key);
  if (!url) return { key, configured: false, reachable: false, status: "NOT_CONFIGURED" };
  try {
    let reported;
    if (key === "sui") {
      // Sui Foundation mainnet no longer supports legacy JSON-RPC.
      // GraphQL chainIdentifier is documented by Mysten Labs.
      const data = await postJson(url, { query: "query { chainIdentifier }" });
      if (data.errors?.length) throw Error("GRAPHQL_ERROR");
      reported = data.data?.chainIdentifier;
    } else {
      const method = c.vm === "evm" ? "eth_chainId" : "getGenesisHash";
      const data = await postJson(url, { jsonrpc: "2.0", id: 1, method, params: [] });
      if (data.error || data.result === undefined || data.result === null) throw Error("RPC_RESPONSE_INVALID");
      reported = data.result;
    }
    if (typeof reported !== "string" || !reported.trim()) throw Error("RPC_RESPONSE_INVALID");
    const expected = expectedFor(key);
    let match = null;
    if (expected) {
      if (c.vm === "evm") {
        const a = Number(reported), b = Number(expected);
        match = Number.isSafeInteger(a) && Number.isSafeInteger(b) && a === b;
      } else match = reported === String(expected);
    }
    return {
      key, configured: true, reachable: true,
      reportedIdentifier: reported, expectedIdentifier: expected,
      identifierMatches: match,
      status: expected == null ? "REACHABLE_UNVERIFIED" : match ? "VERIFIED" : "IDENTIFIER_MISMATCH",
    };
  } catch (e) {
    return { key, configured: true, reachable: false, status: "PROBE_FAILED", error: String(e.message || e).slice(0, 70) };
  }
}
module.exports = { phase6Config, phase6Probe };
