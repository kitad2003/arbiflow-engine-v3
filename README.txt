ArbiFlow Phase 7.1 — integrated read-only CEX update

Upload BOTH server.js and phase7-cex.js into your GitHub repository root. Replace existing files with these names. Keep ALL other repository files unchanged, especially phase6-network-probe.js and prior phase modules. No manual server.js edits or new Render variables required.

Manual routes:
/api/phase7/status
/api/phase7/quote?venue=gemini
/api/phase7/quote?venue=bitstamp
/api/phase7/compare

Notes: Binance HTTP 451 and Bybit HTTP 403 are treated as access restrictions with 1-hour local cooldown, not bypassed. /compare sequentially checks Coinbase, Kraken, Gemini, Bitstamp, OKX; compares USD quotes only, never assumes USDT=USD. Depth is top 10 price levels where available; quote timestamps are observation times, not exchange event times. No verified executable profit, no trading, no background scans.
