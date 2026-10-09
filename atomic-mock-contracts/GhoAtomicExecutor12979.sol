// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// Fork-only atomic GHO ERC-3156 executor. No live deployment scripts.
interface IERC20Atomic {function balanceOf(address) external view returns(uint256);function approve(address,uint256) external returns(bool);}
interface IERC3156Atomic {function maxFlashLoan(address) external view returns(uint256);function flashLoan(address,address,uint256,bytes calldata) external returns(bool);}
interface IUniV3RouterAtomic {
 struct ExactInputSingleParams {address tokenIn;address tokenOut;uint24 fee;address recipient;uint256 deadline;uint256 amountIn;uint256 amountOutMinimum;uint160 sqrtPriceLimitX96;}
 function exactInputSingle(ExactInputSingleParams calldata params) external payable returns(uint256 amountOut);
}
contract GhoAtomicExecutor12979 {
 address public immutable owner; address public immutable lender;address public immutable gho;address public immutable router;
 bytes32 private constant CALLBACK=keccak256("ERC3156FlashBorrower.onFlashLoan");
 bool private active;
 uint256 public lastProfit;uint256 public lastFee;
 struct Route {address intermediate;uint24 buyFee;uint24 sellFee;uint256 minFirstOut;uint256 minReturn;uint256 minProfit;}
 constructor(address l,address g,address r){owner=msg.sender;lender=l;gho=g;router=r;}
 function execute(uint256 amount,Route calldata route) external {
  require(msg.sender==owner,"OWNER_ONLY");require(!active,"ACTIVE");
  require(amount>0&&amount<=IERC3156Atomic(lender).maxFlashLoan(gho),"CAPACITY");
  require(route.intermediate!=address(0)&&route.intermediate!=gho,"TOKEN");
  require(route.minFirstOut>0&&route.minReturn>=amount+route.minProfit,"UNSAFE_MINIMUM");
  require(route.minProfit>0,"PROFIT_GATE_REQUIRED");
  active=true;
  require(IERC3156Atomic(lender).flashLoan(address(this),gho,amount,abi.encode(route)),"FLASH_MINT_FAILED");
  active=false;
 }
 function onFlashLoan(address initiator,address token,uint256 amount,uint256 fee,bytes calldata data) external returns(bytes32) {
  require(active&&msg.sender==lender&&initiator==address(this)&&token==gho,"UNTRUSTED_CALLBACK");
  Route memory route=abi.decode(data,(Route));
  uint256 beforeGho=IERC20Atomic(gho).balanceOf(address(this));
  require(beforeGho>=amount,"LOAN_NOT_RECEIVED");
  uint256 preexisting=beforeGho-amount;
  require(IERC20Atomic(gho).approve(router,0),"RESET_GHO");
  require(IERC20Atomic(gho).approve(router,amount),"APPROVE_GHO");
  uint256 out=IUniV3RouterAtomic(router).exactInputSingle(IUniV3RouterAtomic.ExactInputSingleParams({
   tokenIn:gho,tokenOut:route.intermediate,fee:route.buyFee,recipient:address(this),
   deadline:block.timestamp,amountIn:amount,amountOutMinimum:route.minFirstOut,sqrtPriceLimitX96:0
  }));
  require(out>=route.minFirstOut,"FIRST_SLIPPAGE");
  require(IERC20Atomic(route.intermediate).approve(router,0),"RESET_INTERMEDIATE");
  require(IERC20Atomic(route.intermediate).approve(router,out),"APPROVE_INTERMEDIATE");
  IUniV3RouterAtomic(router).exactInputSingle(IUniV3RouterAtomic.ExactInputSingleParams({
   tokenIn:route.intermediate,tokenOut:gho,fee:route.sellFee,recipient:address(this),
   deadline:block.timestamp,amountIn:out,amountOutMinimum:route.minReturn,sqrtPriceLimitX96:0
  }));
  uint256 afterGho=IERC20Atomic(gho).balanceOf(address(this));
  require(afterGho>=preexisting+amount+fee+route.minProfit,"MIN_PROFIT_NOT_MET");
  lastProfit=afterGho-preexisting-amount-fee;lastFee=fee;
  require(IERC20Atomic(gho).approve(lender,0),"RESET_LENDER");
  require(IERC20Atomic(gho).approve(lender,amount+fee),"APPROVE_REPAY");
  return CALLBACK;
 }
}
