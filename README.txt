ArbiFlow Phase 8.0 Foundation — integrated update

Upload server.js, phase7-cex.js, phase73-net.js, phase8-flashloan.js to the repository root. Replace matching files; retain ALL other existing modules. Deploy on Render. No environment or automatic scan changes.

GET /api/phase8/status
GET /api/phase8/preflight?loanAmount=100000&swapProceeds=100600&loanFeeBps=5&gasUSD=35&extraCostsUSD=0&minimumNetProfitUSD=1

IMPORTANT: This is an arithmetic preflight ONLY. It is not an atomic flash-loan execution or a blockchain-fork simulation. It does not verify 500 DEXs, live liquidity, or profitability. It will NEVER broadcast a trade. Loan principal is not wallet capital; user pays gas.
