// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// Separate research contract: Balancer V2 Vault callback + two independently quoted swaps.
// No real DEX/router is assumed; router addresses and safeguards are operator inputs.
interface IERC20V5 {
 function balanceOf(address) external view returns(uint256);
 function approve(address,uint256) external returns(bool);
 function transfer(address,uint256) external returns(bool);
}
interface IBalancerVaultV5 {
 function flashLoan(address recipient,IERC20V5[] calldata tokens,uint256[] calldata amounts,bytes calldata userData) external;
}
interface ISwapRouterV5 {
 function swapExact(address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,address recipient) external returns(uint256);
}
contract BalancerTwoSwapResearch {
 address public immutable vault;
 address public immutable controller;
 bool private executing;
 struct Plan {address loanToken;address intermediateToken;address routerA;address routerB;uint256 principal;uint256 minIntermediate;uint256 minLoanReturned;uint256 minProfit;uint256 deadline;}
 event RepaymentAndSurplus(uint256 borrowed,uint256 fee,uint256 returned,uint256 profit);
 constructor(address vault_) {require(vault_!=address(0),"ZERO_VAULT");vault=vault_;controller=msg.sender;}
 function start(Plan calldata p) external {
  require(msg.sender==controller,"ONLY_CONTROLLER");
  require(!executing,"ACTIVE");
  require(p.loanToken!=address(0)&&p.intermediateToken!=address(0)&&p.loanToken!=p.intermediateToken,"BAD_TOKENS");
  require(p.routerA!=address(0)&&p.routerB!=address(0)&&p.routerA!=p.routerB,"BAD_ROUTERS");
  require(p.principal>0&&p.minIntermediate>0&&p.minLoanReturned>0,"BAD_AMOUNTS");
  require(block.timestamp<=p.deadline,"EXPIRED");
  // Refuse to attribute pre-existing balances to an arbitrage.
  require(IERC20V5(p.loanToken).balanceOf(address(this))==0,"NONZERO_STARTING_LOAN_BALANCE");
  require(IERC20V5(p.intermediateToken).balanceOf(address(this))==0,"NONZERO_STARTING_INTERMEDIATE_BALANCE");
  executing=true;
  IERC20V5[] memory tokens=new IERC20V5[](1);
  uint256[] memory amounts=new uint256[](1);
  tokens[0]=IERC20V5(p.loanToken);amounts[0]=p.principal;
  IBalancerVaultV5(vault).flashLoan(address(this),tokens,amounts,abi.encode(p));
  executing=false;
 }
 function receiveFlashLoan(IERC20V5[] memory tokens,uint256[] memory amounts,uint256[] memory fees,bytes memory data) external {
  require(msg.sender==vault&&executing,"UNAUTHORIZED_CALLBACK");
  require(tokens.length==1&&amounts.length==1&&fees.length==1,"BAD_CALLBACK");
  Plan memory p=abi.decode(data,(Plan));
  require(address(tokens[0])==p.loanToken&&amounts[0]==p.principal,"LOAN_MISMATCH");
  require(block.timestamp<=p.deadline,"EXPIRED_CALLBACK");
  require(tokens[0].balanceOf(address(this))==p.principal,"BALANCE_NOT_LOAN");
  require(tokens[0].approve(p.routerA,0)&&tokens[0].approve(p.routerA,p.principal),"APPROVAL_A_FAILED");
  uint256 intermediate=ISwapRouterV5(p.routerA).swapExact(p.loanToken,p.intermediateToken,p.principal,p.minIntermediate,address(this));
  require(intermediate>=p.minIntermediate,"FIRST_LEG_SLIPPAGE");
  require(tokens[0].approve(p.routerA,0),"RESET_A_FAILED");
  uint256 actualIntermediate=IERC20V5(p.intermediateToken).balanceOf(address(this));
  require(actualIntermediate==intermediate,"INTERMEDIATE_AMOUNT_MISMATCH");
  require(IERC20V5(p.intermediateToken).approve(p.routerB,0)&&IERC20V5(p.intermediateToken).approve(p.routerB,actualIntermediate),"APPROVAL_B_FAILED");
  uint256 returned=ISwapRouterV5(p.routerB).swapExact(p.intermediateToken,p.loanToken,actualIntermediate,p.minLoanReturned,address(this));
  require(returned>=p.minLoanReturned,"SECOND_LEG_SLIPPAGE");
  require(IERC20V5(p.intermediateToken).approve(p.routerB,0),"RESET_B_FAILED");
  require(IERC20V5(p.intermediateToken).balanceOf(address(this))==0,"INTERMEDIATE_LEFTOVER");
  uint256 due=p.principal+fees[0];
  require(tokens[0].balanceOf(address(this))>=due+p.minProfit,"INSUFFICIENT_PROFIT_AFTER_REPAYMENT");
  require(tokens[0].transfer(vault,due),"REPAYMENT_FAILED");
  uint256 surplus=tokens[0].balanceOf(address(this));
  require(surplus>=p.minProfit,"NO_SURPLUS");
  emit RepaymentAndSurplus(p.principal,fees[0],returned,surplus);
  // Profit remains in this research contract. No live withdrawal route.
 }
}
