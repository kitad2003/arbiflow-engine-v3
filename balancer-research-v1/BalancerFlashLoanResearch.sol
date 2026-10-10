// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @notice Research-only Balancer V2 Vault callback interface from the user-supplied Flashbots tutorial.
/// @dev Deliberately NO SWAP LOGIC, withdrawal, deployment, or profit claim.
interface IERC20Research {
    function balanceOf(address) external view returns(uint256);
    function transfer(address,uint256) external returns(bool);
}
interface IBalancerVaultResearch {
    function flashLoan(address recipient, IERC20Research[] calldata tokens, uint256[] calldata amounts, bytes calldata userData) external;
}
contract BalancerFlashLoanResearch {
    address public immutable vault;
    address public immutable controller;
    bool private entered;
    event RepaymentTest(address indexed token,uint256 amount,uint256 fee);
    constructor(address vault_) {
        require(vault_!=address(0),"INVALID_VAULT");
        vault=vault_;
        controller=msg.sender;
    }
    function begin(IERC20Research[] calldata tokens,uint256[] calldata amounts) external {
        require(msg.sender==controller,"ONLY_CONTROLLER");
        require(!entered,"IN_PROGRESS");
        require(tokens.length>0&&tokens.length==amounts.length,"BAD_LOAN_ARRAYS");
        entered=true;
        IBalancerVaultResearch(vault).flashLoan(address(this),tokens,amounts,"");
        entered=false;
    }
    function receiveFlashLoan(IERC20Research[] memory tokens,uint256[] memory amounts,uint256[] memory feeAmounts,bytes memory) external {
        require(msg.sender==vault&&entered,"NOT_VAULT_CALLBACK");
        require(tokens.length==amounts.length&&tokens.length==feeAmounts.length,"BAD_CALLBACK_ARRAYS");
        for(uint256 i=0;i<tokens.length;i++){
            uint256 due=amounts[i]+feeAmounts[i];
            require(tokens[i].balanceOf(address(this))>=due,"INSUFFICIENT_REPAYMENT");
            require(tokens[i].transfer(vault,due),"REPAYMENT_FAILED");
            emit RepaymentTest(address(tokens[i]),amounts[i],feeAmounts[i]);
        }
    }
}
