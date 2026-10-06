ArbiFlow Engine 4.30.1 — Fork-Only Full Atomic Executor Foundation

Purpose
- Preserve the validated 4.28 discovery, Morpho fork-accrual, exact sizing, firm-quote, and executor-state gates.
- Add ArbiFlowAtomicExecutor430.sol implementing the full atomic callback architecture:
  Aave V3 flashLoanSimple -> Morpho Blue liquidate -> receive collateral -> 0x-bound swap -> Morpho repayment -> Aave principal+premium repayment -> residual profit transfer.
- Deploy the full atomic executor ONLY on the disposable Base fork during startup verification.
- Verify Aave/Morpho callback caller guards on the fork.

Fail-closed behavior
- A successful full liquidation simulation is NOT claimed unless a fresh candidate is exactly liquidatable after fork accrual and a firm 0x quote is bound.
- Healthy candidates remain rejected.
- Full transaction gas remains unavailable until a candidate-bound atomic transaction can actually be estimated.
- No Base-mainnet deployment, private key, signing, transaction broadcast, or funds movement is enabled.

Expected startup report additions
atomicExecutor.deployed = true
atomicExecutor.forkOnly = true
atomicExecutor.callbackGuardsConfirmed = true
atomicExecutor.fullAtomicSimulationPerformed = false unless a future candidate-bound simulation gate is satisfied

Validation sequence
1. Deploy to Render with BASE_RPC_URL configured as before.
2. Startup must compile both Solidity contracts and pass the disposable-fork test.
3. Submit the complete startup log for review.
4. Only after startup passes, run /api/bots/base/scan and submit the complete scan.

4.30.0 CONTROLLED DISPOSABLE-FORK ATOMIC EXECUTION TEST
- Adds ControlledAtomicForkTest4300.js.
- Uses a real Morpho borrower/market but changes only the oracle runtime on the disposable Hardhat fork to a clearly labeled synthetic price targeting HF < 1.
- Re-accrues Morpho after the fork-only oracle shock and recomputes the exact liquidation bound.
- Deploys ArbiFlowAtomicExecutor430 only on the disposable fork.
- Requests a real 0x Swap API v2 AllowanceHolder firm quote with the fork executor as taker.
- Attempts Aave flashLoanSimple -> Morpho liquidation -> 0x collateral swap -> Morpho repayment -> Aave repayment -> residual profit check atomically.
- Requires ZEROX_API_KEY. It fails closed if the candidate, quote, min output, swap, repayment, or transaction fails.
- Controlled results are SYNTHETIC_FORK_ONLY_NOT_CURRENT_MAINNET_STATE and must never be represented as current mainnet liquidation eligibility or profit.
- No mainnet deployment, signing, broadcast, or state change is performed.
- Controlled test endpoint: GET or POST /api/test/base/controlled-atomic
- GET is browser-accessible and executes the exact same disposable-fork-only handler as POST.
- Endpoint automatically selects the closest current Morpho discovery candidate, then performs the synthetic fork-only oracle-shock test in an isolated Hardhat child process.
