ArbiFlow Engine 4.14.2 - Fork Startup Wiring Fix

Purpose:
- Fix the deployment path proven by the 4.14.1 Render log, where npm start ran node server.js directly.
- npm start now runs Startup4142.js.
- Startup4142.js requires BASE_RPC_URL, invokes the locally installed Hardhat binary, runs BaseForkTest4142.js, validates the generated fork report, and only then launches server.js.
- server.js refuses to listen if the startup wrapper was bypassed.

Expected Render startup sequence:
  npm start
  node Startup4142.js
  [ArbiFlow 4.14.2] FORK STARTUP VERIFICATION BEGIN
  ...Hardhat compile/fork output...
  [ArbiFlow 4.14.2] FORK STARTUP VERIFICATION PASS ...
  [ArbiFlow 4.14.2] STARTING WEB SERVICE AFTER VERIFIED FORK PASS
  ArbiFlow Engine 4.14.2 listening on port 10000

Safety:
- Ephemeral Hardhat Base-mainnet fork only.
- No Base-mainnet deployment.
- No wallet/private key requested.
- No live transaction broadcast.
- executeLiquidationPlan remains hard-disabled.
- Server fails closed if the fork verification does not pass.

Deployment requirement:
Replace/commit ALL files in this package, especially package.json. If Render still prints arbiflow-engine-v3@3.1.0 or '> node server.js' immediately after npm start, the new package.json was not deployed.
