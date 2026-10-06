// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ArbiFlow 4.14 Base-fork TEST harness.
/// @dev validatePlan is side-effect-free. executeLiquidationPlan remains hard-disabled.
contract ArbiFlowExecutor414 {
    error LiveExecutionDisabled();
    error ZeroBorrower();
    error ZeroRepayAmount();
    error ZeroMinimumOutput();
    error ZeroSwapTarget();
    error EmptySwapCalldata();

    function validatePlan(bytes32 marketId,address borrower,uint256 repayAmount,uint256 minLoanAssetOut,address swapTarget,bytes calldata swapCalldata) external pure returns (bytes32 planHash) {
        if (borrower == address(0)) revert ZeroBorrower();
        if (repayAmount == 0) revert ZeroRepayAmount();
        if (minLoanAssetOut == 0) revert ZeroMinimumOutput();
        if (swapTarget == address(0)) revert ZeroSwapTarget();
        if (swapCalldata.length == 0) revert EmptySwapCalldata();
        return keccak256(abi.encode(marketId, borrower, repayAmount, minLoanAssetOut, swapTarget, keccak256(swapCalldata)));
    }

    function executeLiquidationPlan(bytes32,address,uint256,uint256,address,bytes calldata) external pure {
        revert LiveExecutionDisabled();
    }
}
