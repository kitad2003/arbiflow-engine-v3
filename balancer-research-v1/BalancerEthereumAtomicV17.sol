// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// Research-only implementation of Flashbots' Balancer callback and two-venue backrun
// atomicity. Deploy on LOCAL ETHEREUM FORK ONLY; no production deployment task exists.
interface IV17Token {
 function balanceOf(address) external view returns(uint256);
 function transfer(address,uint256) external returns(bool);
}
interface IV17Vault {
 function flashLoan(address, IV17Token[] calldata, uint256[] calldata, bytes calldata) external;
}
interface IV17Pair {
 function token0() external view returns(address);
 function token1() external view returns(address);
 function getReserves() external view returns(uint112,uint112,uint32);
 function swap(uint256,uint256,address,bytes calldata) external;
}
contract BalancerEthereumAtomicV17 {
 address public immutable vault;
 address public immutable operator;
 address public immutable loanToken;
 address public immutable intermediateToken;
 bool private active;
 event ForkAtomicResult(uint256 borrowed,uint256 fee,uint256 returned,uint256 surplus);
 constructor(address v,address loan,address intermediate) {
  require(v!=address(0)&&loan!=address(0)&&intermediate!=address(0)&&loan!=intermediate,"BAD_ADDRESSES");
  vault=v;operator=msg.sender;loanToken=loan;intermediateToken=intermediate;
 }
 function makeFlashLoan(address firstPair,address secondPair,uint256 amount,uint256 minProfit) external {
  require(msg.sender==operator&&!active,"NOT_OPERATOR_OR_BUSY");
  require(amount>0&&minProfit>0&&firstPair!=secondPair,"BAD_PLAN");
  require(IV17Token(loanToken).balanceOf(address(this))==0,"EXISTING_LOAN_FUNDS");
  require(IV17Token(intermediateToken).balanceOf(address(this))==0,"EXISTING_OTHER_FUNDS");
  active=true;
  IV17Token[] memory tokens=new IV17Token[](1);
  uint256[] memory amounts=new uint256[](1);
  tokens[0]=IV17Token(loanToken);amounts[0]=amount;
  IV17Vault(vault).flashLoan(address(this),tokens,amounts,abi.encode(firstPair,secondPair,amount,minProfit));
  active=false;
 }
 function _swap(address pool,address tokenIn,address tokenOut,uint256 inAmount) private returns(uint256 amountOut) {
  IV17Pair pair=IV17Pair(pool);
  address t0=pair.token0();address t1=pair.token1();
  require((t0==tokenIn&&t1==tokenOut)||(t1==tokenIn&&t0==tokenOut),"TOKEN_PAIR_MISMATCH");
  (uint112 r0,uint112 r1,)=pair.getReserves();
  (uint256 reserveIn,uint256 reserveOut)=tokenIn==t0?(uint256(r0),uint256(r1)):(uint256(r1),uint256(r0));
  require(reserveIn>0&&reserveOut>0,"NO_RESERVES");
  uint256 amountInWithFee=inAmount*997;
  amountOut=(amountInWithFee*reserveOut)/(reserveIn*1000+amountInWithFee);
  require(amountOut>0&&amountOut<reserveOut,"NO_OUTPUT");
  require(IV17Token(tokenIn).transfer(pool,inAmount),"INPUT_TRANSFER_FAILED");
  pair.swap(tokenOut==t0?amountOut:0,tokenOut==t1?amountOut:0,address(this),"");
 }
 function receiveFlashLoan(IV17Token[] memory tokens,uint256[] memory amounts,uint256[] memory feeAmounts,bytes memory userData) external {
  require(msg.sender==vault&&active,"UNAUTHORIZED_CALLBACK");
  require(tokens.length==1&&amounts.length==1&&feeAmounts.length==1,"BAD_FLASH_LOAN");
  (address first,address second,uint256 principal,uint256 minProfit)=abi.decode(userData,(address,address,uint256,uint256));
  require(address(tokens[0])==loanToken&&amounts[0]==principal,"LOAN_MISMATCH");
  require(tokens[0].balanceOf(address(this))==principal,"UNEXPECTED_LOAN_BALANCE");
  uint256 mid=_swap(first,loanToken,intermediateToken,principal);
  require(IV17Token(intermediateToken).balanceOf(address(this))==mid,"MID_BALANCE_MISMATCH");
  uint256 returned=_swap(second,intermediateToken,loanToken,mid);
  require(IV17Token(intermediateToken).balanceOf(address(this))==0,"MID_LEFTOVER");
  uint256 due=principal+feeAmounts[0];
  require(tokens[0].balanceOf(address(this))>=due+minProfit,"NO_NET_ARBITRAGE");
  require(tokens[0].transfer(vault,due),"FLASH_REPAY_FAILED");
  uint256 surplus=tokens[0].balanceOf(address(this));
  require(surplus>=minProfit,"NO_SURPLUS");
  emit ForkAtomicResult(principal,feeAmounts[0],returned,surplus);
 }
}
