// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// Fork-only two-venue Aave test. No owner withdrawals or production routing.
interface IERC20A5 {
 function balanceOf(address) external view returns(uint256);
 function approve(address,uint256) external returns(bool);
}
interface IAaveA5 {
 function flashLoanSimple(address,address,uint256,bytes calldata,uint16) external;
}
interface IV3RouterA5 {
 struct ExactInputSingleParams {address tokenIn;address tokenOut;uint24 fee;address recipient;uint256 amountIn;uint256 amountOutMinimum;uint160 sqrtPriceLimitX96;}
 function exactInputSingle(ExactInputSingleParams calldata) external payable returns(uint256);
}
contract ResearchAaveTwoSwapReceiver {
 address public immutable pool;
 address public immutable owner;
 event TwoSwapResult(uint256 principal,uint256 premium,uint256 firstOut,uint256 returned,uint256 surplus);
 constructor(address p){require(p!=address(0),"ZERO_POOL");pool=p;owner=msg.sender;}
 function request(address base,address other,uint256 amount,address router1,address router2,uint24 fee1,uint24 fee2,uint256 minFirst,uint256 minReturn) external {
  require(msg.sender==owner && amount>0,"NOT_OWNER_OR_ZERO");
  require(base!=other && router1!=address(0) && router2!=address(0),"BAD_ROUTE");
  IAaveA5(pool).flashLoanSimple(address(this),base,amount,abi.encode(other,router1,router2,fee1,fee2,minFirst,minReturn),0);
 }
 function executeOperation(address asset,uint256 amount,uint256 premium,address initiator,bytes calldata data) external returns(bool){
  require(msg.sender==pool && initiator==address(this),"UNAUTHORIZED_CALLBACK");
  (address other,address r1,address r2,uint24 f1,uint24 f2,uint256 minFirst,uint256 minReturn)=abi.decode(data,(address,address,address,uint24,uint24,uint256,uint256));
  require(IERC20A5(asset).approve(r1,0) && IERC20A5(asset).approve(r1,amount),"APPROVE_1_FAILED");
  uint256 first=IV3RouterA5(r1).exactInputSingle(IV3RouterA5.ExactInputSingleParams(asset,other,f1,address(this),amount,minFirst,0));
  require(first>0 && IERC20A5(other).approve(r2,0) && IERC20A5(other).approve(r2,first),"APPROVE_2_FAILED");
  uint256 returned=IV3RouterA5(r2).exactInputSingle(IV3RouterA5.ExactInputSingleParams(other,asset,f2,address(this),first,minReturn,0));
  uint256 debt=amount+premium;
  require(returned>=debt && IERC20A5(asset).balanceOf(address(this))>=debt,"UNPROFITABLE_REPAYMENT");
  require(IERC20A5(asset).approve(pool,0) && IERC20A5(asset).approve(pool,debt),"REPAY_APPROVAL_FAILED");
  emit TwoSwapResult(amount,premium,first,returned,returned-debt);
  return true;
 }
}
