ArbiFlow 4.58.5 — Opportunity Scanner Config Binding Repair
Fixes the 4.58.4 CHAIN_ERROR caused by calling nonexistent uniswapV3ChainConfig4490.
The scanner now binds to the actual existing UNISWAP_V3_DISCOVERY_4470, RPC_URLS, UNISWAP_V3_QUOTER_V1_4490, JsonRpcProvider, and quoteV3Single4490 interfaces already present in server.js.
Also corrects the quote helper signature/BigInt return handling.
Preserves 4.58.4 bounded concurrency, caching, timeouts, progress counters, 4.58.3 nonblocking startup, and read-only/no-mainnet-action gates.
