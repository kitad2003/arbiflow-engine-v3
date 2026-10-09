// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IERC20Bal12964 {
 function balanceOf(address) external view returns (uint256);
 function transfer(address,uint256) external returns (bool);
}
interface IBalVault12964 {
 function flashLoan(address recipient,address[] calldata tokens,uint256[] calldata amounts,bytes calldata userData) external;
}
contract BalancerV2ForkReceiver12964 {
 address public immutable vault;
 address public immutable token;
 uint256 public borrowed;
 uint256 public paidFee;
 bool public callbackSeen;
 constructor(address vault_,address token_){vault=vault_;token=token_;}
 function start(uint256 amount) external {
  require(msg.sender==tx.origin,"FORK_TEST_ONLY_CALL");
  address[] memory tokens=new address[](1);tokens[0]=token;
  uint256[] memory amounts=new uint256[](1);amounts[0]=amount;
  IBalVault12964(vault).flashLoan(address(this),tokens,amounts,"");
  require(callbackSeen,"NO_CALLBACK");
 }
 function receiveFlashLoan(address[] calldata tokens,uint256[] calldata amounts,uint256[] calldata feeAmounts,bytes calldata) external {
  require(msg.sender==vault&&tokens.length==1&&amounts.length==1&&feeAmounts.length==1,"BAD_CALLBACK");
  require(tokens[0]==token,"WRONG_TOKEN");
  require(IERC20Bal12964(token).balanceOf(address(this))>=amounts[0]+feeAmounts[0],"NEEDS_PREMIUM_FUNDING");
  borrowed=amounts[0];paidFee=feeAmounts[0];callbackSeen=true;
  require(IERC20Bal12964(token).transfer(vault,amounts[0]+feeAmounts[0]),"REPAY_FAILED");
 }
}
