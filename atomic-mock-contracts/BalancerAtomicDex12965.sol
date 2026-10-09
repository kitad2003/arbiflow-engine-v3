// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IBalVaultAtomic12965 {
 function flashLoan(address recipient,address[] calldata tokens,uint256[] calldata amounts,bytes calldata userData) external;
}
interface IERC20Atomic12965 {
 function balanceOf(address owner) external view returns(uint256);
 function approve(address spender,uint256 amount) external returns(bool);
 function transfer(address to,uint256 amount) external returns(bool);
}
interface IUniRouterAtomic12965 {
 struct ExactInputSingleParams {address tokenIn;address tokenOut;uint24 fee;address recipient;uint256 amountIn;uint256 amountOutMinimum;uint160 sqrtPriceLimitX96;}
 function exactInputSingle(ExactInputSingleParams calldata params) external payable returns(uint256);
}
interface IAeroRouterAtomic12965 {
 struct ExactInputSingleParams {address tokenIn;address tokenOut;int24 tickSpacing;address recipient;uint256 deadline;uint256 amountIn;uint256 amountOutMinimum;uint160 sqrtPriceLimitX96;}
 function exactInputSingle(ExactInputSingleParams calldata params) external payable returns(uint256);
}
contract BalancerAtomicDex12965 {
 address public immutable vault;
 address public immutable usdc;
 address public immutable weth;
 address public immutable uni;
 address public immutable aero;
 bool public callbackSeen;
 uint256 public lastReturned;
 uint256 public lastFee;
 uint256 public lastSurplus;
 constructor(address v,address u,address w,address ur,address ar){vault=v;usdc=u;weth=w;uni=ur;aero=ar;}
 function start(uint256 amount,bool uniFirst,uint256 minProfit,uint256 deadline) external {
  require(msg.sender==tx.origin,"FORK_DEMO_ONLY");
  callbackSeen=false;
  address[] memory tokens=new address[](1);tokens[0]=usdc;
  uint256[] memory amounts=new uint256[](1);amounts[0]=amount;
  IBalVaultAtomic12965(vault).flashLoan(address(this),tokens,amounts,abi.encode(uniFirst,minProfit,deadline));
  require(callbackSeen,"MISSING_CALLBACK");
 }
 function receiveFlashLoan(address[] calldata tokens,uint256[] calldata amounts,uint256[] calldata fees,bytes calldata data) external {
  require(msg.sender==vault&&tokens.length==1&&amounts.length==1&&fees.length==1,"BAD_CALLBACK");
  require(tokens[0]==usdc,"BAD_ASSET");
  (bool uniFirst,uint256 minProfit,uint256 deadline)=abi.decode(data,(bool,uint256,uint256));
  require(block.timestamp<=deadline,"EXPIRED");
  uint256 borrowed=amounts[0];
  uint256 mid=uniFirst?_uni(usdc,weth,borrowed):_aero(usdc,weth,borrowed,deadline);
  require(mid>0,"NO_WETH");
  uint256 back=uniFirst?_aero(weth,usdc,mid,deadline):_uni(weth,usdc,mid);
  uint256 obligation=borrowed+fees[0];
  require(back>=obligation+minProfit,"NEGATIVE_ATOMIC_PROFIT");
  lastReturned=back;lastFee=fees[0];lastSurplus=back-obligation;callbackSeen=true;
  require(IERC20Atomic12965(usdc).transfer(vault,obligation),"BALANCER_REPAY_FAILED");
 }
 function _uni(address input,address output,uint256 amount) internal returns(uint256){
  IERC20Atomic12965(input).approve(uni,0);
  IERC20Atomic12965(input).approve(uni,amount);
  return IUniRouterAtomic12965(uni).exactInputSingle(
   IUniRouterAtomic12965.ExactInputSingleParams(input,output,500,address(this),amount,1,0));
 }
 function _aero(address input,address output,uint256 amount,uint256 deadline) internal returns(uint256){
  IERC20Atomic12965(input).approve(aero,0);
  IERC20Atomic12965(input).approve(aero,amount);
  return IAeroRouterAtomic12965(aero).exactInputSingle(
   IAeroRouterAtomic12965.ExactInputSingleParams(input,output,100,address(this),deadline,amount,1,0));
 }
}
