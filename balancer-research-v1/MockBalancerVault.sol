// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// Isolated local mock matching the Balancer V2 tutorial callback semantics.
interface IMockToken {function transfer(address,uint256) external returns(bool);function balanceOf(address) external view returns(uint256);}
interface ICallback {function receiveFlashLoan(IMockToken[] memory,uint256[] memory,uint256[] memory,bytes memory) external;}
contract MockResearchToken {
 mapping(address=>uint256) public balanceOf;
 function mint(address to,uint256 amount) external {balanceOf[to]+=amount;}
 function transfer(address to,uint256 amount) external returns(bool) {
  require(balanceOf[msg.sender]>=amount,"LOW_BALANCE");
  balanceOf[msg.sender]-=amount;balanceOf[to]+=amount;return true;
 }
}
contract MockBalancerVault {
 uint256 public immutable feeBps;
 constructor(uint256 fee_) {require(fee_<=10000,"BAD_FEE");feeBps=fee_;}
 function flashLoan(address recipient,IMockToken[] calldata tokens,uint256[] calldata amounts,bytes calldata userData) external {
  require(tokens.length==amounts.length&&tokens.length>0,"BAD_ARRAYS");
  uint256[] memory fees=new uint256[](tokens.length);
  uint256[] memory balances=new uint256[](tokens.length);
  for(uint256 i=0;i<tokens.length;i++){
   balances[i]=tokens[i].balanceOf(address(this));
   require(balances[i]>=amounts[i],"NO_LIQUIDITY");
   fees[i]=(amounts[i]*feeBps+9999)/10000;
   require(tokens[i].transfer(recipient,amounts[i]),"SEND_FAILED");
  }
  ICallback(recipient).receiveFlashLoan(tokens,amounts,fees,userData);
  for(uint256 i=0;i<tokens.length;i++)require(tokens[i].balanceOf(address(this))>=balances[i]+fees[i],"NOT_REPAID");
 }
}
