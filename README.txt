ArbiFlow Phase 7: Five CEX public quote probes (manual, read-only).

1. Upload phase7-cex.js to the ROOT of the GitHub repo beside server.js.
2. In your CURRENT server.js, find the existing Express app initialization (const app = express() or equivalent).
3. Add exactly ONE line after app is initialized, before app.listen:
   require('./phase7-cex').mount(app);
4. Commit, deploy to Render. Do NOT replace server.js with an older version.
5. Test https://arbiflow-engine-v3.onrender.com/api/phase7/status
6. Test one at a time (avoid rate limits):
   https://arbiflow-engine-v3.onrender.com/api/phase7/quote?venue=binance
   https://arbiflow-engine-v3.onrender.com/api/phase7/quote?venue=coinbase
   https://arbiflow-engine-v3.onrender.com/api/phase7/quote?venue=kraken
   https://arbiflow-engine-v3.onrender.com/api/phase7/quote?venue=okx
   https://arbiflow-engine-v3.onrender.com/api/phase7/quote?venue=bybit

Notes: No keys. No scheduled scan. No orders. Bid/ask are public indicative book-top prices, not executable size-aware quotes. Coinbase/Kraken use USD; others use USDT. Do NOT compare these as equal or calculate profit until normalized, with depth, fees, withdrawal/transfer constraints and latency. Public APIs can be geo-blocked or rate-limited. This addon does not activate the 25 CEX registry or DEX adapters.
