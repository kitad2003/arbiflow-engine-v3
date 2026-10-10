// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Fork-only Aave V3 flashLoanSimple callback smoke-test.
/// @dev No swap or profit claim. Borrowed amount plus premium must be pre-funded
///      by the local fork test; the test contract is not a production executor.
interface IERC20Fork {
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}
interface IAaveSimpleFork {
    function flashLoanSimple(address receiver, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external;
}
contract ResearchAaveSimpleReceiver {
    address public immutable pool;
    address public immutable owner;
    event RepaymentPrepared(address indexed asset, uint256 principal, uint256 premium);
    constructor(address pool_) {
        require(pool_ != address(0), "ZERO_POOL");
        pool = pool_;
        owner = msg.sender;
    }
    function request(address asset, uint256 amount) external {
        require(msg.sender == owner, "ONLY_OWNER");
        require(amount > 0, "ZERO_AMOUNT");
        IAaveSimpleFork(pool).flashLoanSimple(address(this), asset, amount, "", 0);
    }
    function executeOperation(address asset, uint256 amount, uint256 premium, address initiator, bytes calldata)
        external returns (bool)
    {
        require(msg.sender == pool, "ONLY_POOL");
        require(initiator == address(this), "BAD_INITIATOR");
        uint256 repayment = amount + premium;
        require(IERC20Fork(asset).balanceOf(address(this)) >= repayment, "PREMIUM_NOT_FUNDED");
        require(IERC20Fork(asset).approve(pool, repayment), "APPROVAL_FAILED");
        emit RepaymentPrepared(asset, amount, premium);
        return true;
    }
}
