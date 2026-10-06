ArbiFlow Engine 4.31.0
CONTROLLED FORK DETERMINISTIC ATOMIC EXECUTION TEST

Preserves the validated 4.30.3 production/read-only pipeline.

New controlled test behavior:
- Uses a real Morpho market/borrower discovered from Base.
- Alters the oracle runtime ONLY on the disposable Hardhat fork to force test-only liquidation eligibility.
- Deploys the existing ArbiFlowAtomicExecutor430 on the disposable fork.
- Deploys ControlledForkSwapAdapter431 ONLY on the disposable fork.
- Funds the adapter with loan-token liquidity on the disposable fork and executes the actual executor callback/approval/swap/settlement chain.
- Exercises Aave flashLoanSimple -> Morpho liquidate -> onMorphoLiquidate -> deterministic fork swap -> Morpho repayment -> Aave repayment -> residual-profit guard.
- Does NOT claim the deterministic adapter validates production 0x execution.
- Production 0x quote validation remains unresolved until the executor has a mainnet-valid taker context.
- No mainnet deployment, signing, broadcast, or real-fund movement is enabled.

The controlled test must always report:
CONTROLLED_FORK_ONLY_TEST_MUTATION_NOT_CURRENT_MAINNET_STATE
productionZeroXQuoteValidated=false
mainnetDeployment=false
mainnetBroadcast=false
fundsMovedOnMainnet=false
