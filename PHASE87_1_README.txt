ArbiFlow Phase 8.7.1 rate-limit update

Upload ONLY phase87-indexed-discovery.js to the root of your GitHub repository, replacing the existing file. The other files in this ZIP are optional local tests and notes. No server.js or package.json change is required.

What changed:
- GeckoTerminal requests spaced 1.5 seconds apart.
- On HTTP 429, honor Retry-After (seconds or HTTP-date); otherwise 60-second cooldown; capped at 15 minutes.
- Skip remaining GeckoTerminal endpoints while cooling down, including across manually triggered scans.
- Still request DEX Screener and preserve valid partial results.
- Expose geckoCooldownUntil on /api/liquidity87/status.
- Never auto-scan, sign, broadcast, or execute transactions.

Verification after Render deploy:
1. GET /api/liquidity87/status -> build 8.7.1
2. GET /api/liquidity87/run -> manual scan started
3. GET /api/liquidity87/status -> examine lastResult and cooldown field.

HTTP 429 may still occur; this update reduces needless repeated requests, not a guarantee of GeckoTerminal availability. All indexed pools remain unverified and not execution eligible.
