# ArbiFlow 25x25 Expansion Registry — additive, read-only

This is a tested *registry module*, not a complete deployed scanner or 25 working integrations. It does not make external API calls, trade, sign, or send transactions. Existing ArbiFlow files are not replaced.

## Install after checking against current production source
1. Add `registry.js` to the project as `expansion-registry.js`.
2. In the existing Express startup file, after the Express app is created and before starting the HTTP listener, add:
   `require('./expansion-registry').mount(app);`
3. Deploy and inspect `/api/expansion/status` and `/api/expansion/inventory`.
4. Keep current scan endpoints and safety settings unchanged.

## Next engineering stages
- Per-chain RPC validation and chain-ID checks with bounded concurrency, retries, and rate limits.
- Per-exchange CCXT `loadMarkets` and public order-book tests; verify exchange IDs and geographic permissions first.
- Per-chain 1inch Classic quote and liquidity-sources adapter where officially supported; verify API credentials and quotas.
- Direct DEX pool discovery and deduplication, separately count DEX protocols, pools, venues, and aggregator routes.
- Compare independent quotes; estimate slippage, gas, loan premiums, settlement and inventory risks; fork-simulate before any execution.

No claims of 500 active DEXs, 25 functioning RPCs, or 25 functioning CEXs are made.
