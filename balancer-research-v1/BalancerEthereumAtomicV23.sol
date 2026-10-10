// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// Research-only implementation of Flashbots' Balancer callback and two-venue backrun
// atomicity. Deploy on LOCAL ETHEREUM FORK ONLY; no production deployment task exists.
interface IV23Token {
 function balanceOf(address) external view returns(uint256);
 function transfer(address,uint256) external returns(bool);
}
interface IV23Vault {
 function flashLoan(address, IV23Token[] calldata, uint256[] calldata, bytes calldata) external;
}
interface IV23Factory { function getPair(address,address) external view returns(address); }
interface IV23Pair {
 function factory() external view returns(address);
 function token0() external view returns(address);
 function token1() external view returns(address);
 function getReserves() external view returns(uint112,uint112,uint32);
 function swap(uint256,uint256,address,bytes calldata) external;
}
contract BalancerEthereumAtomicV23 {
 address public immutable vault;
 address public immutable operator;
 address public immutable loanToken;
 address public immutable intermediateToken;
 address public immutable factoryA;
 address public immutable factoryB;
 bool private active;
 event ForkAtomicResult(uint256 borrowed,uint256 fee,uint256 returned,uint256 surplus);
 constructor(address v,address loan,address intermediate,address fA,address fB) {
  require(v!=address(0)&&loan!=address(0)&&intermediate!=address(0)&&loan!=intermediate,"BAD_ADDRESSES");
  require(fA!=address(0)&&fB!=address(0)&&fA!=fB,"BAD_FACTORIES");
  vault=v;operator=msg.sender;loanToken=loan;intermediateToken=intermediate;factoryA=fA;factoryB=fB;
 }
 function makeFlashLoan(address firstPair,address secondPair,uint256 amount,uint256 minFirstOut,uint256 minSecondOut,uint256 minProfit) external {
  require(msg.sender==operator&&!active,"NOT_OPERATOR_OR_BUSY");
  require(amount>0&&minFirstOut>0&&minSecondOut>0&&minProfit>0&&firstPair!=secondPair,"BAD_PLAN");
  require(IV23Token(loanToken).balanceOf(address(this))==0,"EXISTING_LOAN_FUNDS");
  require(IV23Token(intermediateToken).balanceOf(address(this))==0,"EXISTING_OTHER_FUNDS");
  active=true;
  IV23Token[] memory tokens=new IV23Token[](1);
  uint256[] memory amounts=new uint256[](1);
  tokens[0]=IV23Token(loanToken);amounts[0]=amount;
  IV23Vault(vault).flashLoan(address(this),tokens,amounts,abi.encode(firstPair,secondPair,amount,minFirstOut,minSecondOut,minProfit));
  active=false;
 }
 function _swap(address pool,address tokenIn,address tokenOut,uint256 inAmount,uint256 minOut,address requiredFactory) private returns(uint256 amountOut) {
  IV23Pair pair=IV23Pair(pool);
  require(pair.factory()==requiredFactory,"WRONG_FACTORY");
  address t0=pair.token0();address t1=pair.token1();
  require(IV23Factory(requiredFactory).getPair(t0,t1)==pool,"FACTORY_PAIR_MISMATCH");
  require((t0==tokenIn&&t1==tokenOut)||(t1==tokenIn&&t0==tokenOut),"TOKEN_PAIR_MISMATCH");
  (uint112 r0,uint112 r1,)=pair.getReserves();
  (uint256 reserveIn,uint256 reserveOut)=tokenIn==t0?(uint256(r0),uint256(r1)):(uint256(r1),uint256(r0));
  require(reserveIn>0&&reserveOut>0,"NO_RESERVES");
  uint256 amountInWithFee=inAmount*997;
  amountOut=(amountInWithFee*reserveOut)/(reserveIn*1000+amountInWithFee);
  require(amountOut>=minOut&&amountOut<reserveOut,"SLIPPAGE_OR_NO_OUTPUT");
  require(IV23Token(tokenIn).transfer(pool,inAmount),"INPUT_TRANSFER_FAILED");
  pair.swap(tokenOut==t0?amountOut:0,tokenOut==t1?amountOut:0,address(this),"");
 }
 function receiveFlashLoan(IV23Token[] memory tokens,uint256[] memory amounts,uint256[] memory feeAmounts,bytes memory userData) external {
  require(msg.sender==vault&&active,"UNAUTHORIZED_CALLBACK");
  require(tokens.length==1&&amounts.length==1&&feeAmounts.length==1,"BAD_FLASH_LOAN");
  (address first,address second,uint256 principal,uint256 minFirstOut,uint256 minSecondOut,uint256 minProfit)=abi.decode(userData,(address,address,uint256,uint256,uint256,uint256));
  require(address(tokens[0])==loanToken&&amounts[0]==principal,"LOAN_MISMATCH");
  require(tokens[0].balanceOf(address(this))==principal,"UNEXPECTED_LOAN_BALANCE");
  uint256 mid=_swap(first,loanToken,intermediateToken,principal,minFirstOut,factoryA);
  require(IV23Token(intermediateToken).balanceOf(address(this))==mid,"MID_BALANCE_MISMATCH");
  uint256 returned=_swap(second,intermediateToken,loanToken,mid,minSecondOut,factoryB);
  require(IV23Token(intermediateToken).balanceOf(address(this))==0,"MID_LEFTOVER");
  uint256 due=principal+feeAmounts[0];
  require(tokens[0].balanceOf(address(this))>=due+minProfit,"NO_NET_ARBITRAGE");
  require(tokens[0].transfer(vault,due),"FLASH_REPAY_FAILED");
  uint256 surplus=tokens[0].balanceOf(address(this));
  require(surplus>=minProfit,"NO_SURPLUS");
  emit ForkAtomicResult(principal,feeAmounts[0],returned,surplus);
 }
}
