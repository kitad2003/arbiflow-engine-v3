ArbiFlow Engine 4.29.0 — Fork-Only Full Atomic Executor Foundation

Purpose
- Preserve the validated 4.28 discovery, Morpho fork-accrual, exact sizing, firm-quote, and executor-state gates.
- Add ArbiFlowAtomicExecutor429.sol implementing the full atomic callback architecture:
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
