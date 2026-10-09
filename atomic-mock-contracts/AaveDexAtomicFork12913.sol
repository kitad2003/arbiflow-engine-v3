// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IT12913 { function balanceOf(address) external view returns(uint256); function approve(address,uint256) external returns(bool); }
interface IA12913 { function flashLoanSimple(address,address,uint256,bytes calldata,uint16) external; }
interface IU12913 { struct P {address tokenIn;address tokenOut;uint24 fee;address recipient;uint256 amountIn;uint256 amountOutMinimum;uint160 sqrtPriceLimitX96;} function exactInputSingle(P calldata) external payable returns(uint256); }
interface IS12913 { struct P {address tokenIn;address tokenOut;int24 tickSpacing;address recipient;uint256 deadline;uint256 amountIn;uint256 amountOutMinimum;uint160 sqrtPriceLimitX96;} function exactInputSingle(P calldata) external payable returns(uint256); }
/// @notice Aave + 2 real venues FORK-ONLY experiment. Test harness must not deploy on mainnet.
contract AaveDexAtomicFork12913 {
 address constant POOL=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
 address constant USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
 address constant WETH=0x4200000000000000000000000000000000000006;
 address constant UNI=0x2626664c2603336E57B271c5C0b26F421741e481;
 address constant AERO=0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5;
 address public immutable owner;
 bool private entered;
 struct Plan {uint256 amount;uint256 minWeth;uint256 minUsdc;uint256 minProfit;uint256 deadline;bool uniFirst;bool probeAfterSwaps;}
 error Unauthorized();error InvalidPlan();error BadCallback();error Unprofitable();error BothSwapsReached(uint256 wethReceived,uint256 usdcReceived);
 constructor(){owner=msg.sender;}
 function start(Plan calldata p) external {
  if(msg.sender!=owner||entered)revert Unauthorized();
  if(p.amount==0||p.minWeth==0||p.minUsdc==0||p.minProfit==0||p.deadline<block.timestamp)revert InvalidPlan();
  entered=true;
  IA12913(POOL).flashLoanSimple(address(this),USDC,p.amount,abi.encode(p),0);
  entered=false;
 }
 function executeOperation(address asset,uint256 amount,uint256 premium,address initiator,bytes calldata raw) external returns(bool){
  if(msg.sender!=POOL||initiator!=address(this)||asset!=USDC||!entered)revert BadCallback();
  Plan memory p=abi.decode(raw,(Plan));
  if(p.amount!=amount||p.deadline<block.timestamp)revert InvalidPlan();
  uint256 initial=IT12913(USDC).balanceOf(address(this));
  address first=p.uniFirst?UNI:AERO;address second=p.uniFirst?AERO:UNI;
  require(IT12913(USDC).approve(first,0)&&IT12913(USDC).approve(first,amount),"APPROVE_FIRST");
  uint256 wethOut=p.uniFirst?
    IU12913(UNI).exactInputSingle(IU12913.P(USDC,WETH,500,address(this),amount,p.minWeth,0)):
    IS12913(AERO).exactInputSingle(IS12913.P(USDC,WETH,100,address(this),p.deadline,amount,p.minWeth,0));
  require(wethOut>=p.minWeth,"BUY_MIN");
  require(IT12913(WETH).approve(second,0)&&IT12913(WETH).approve(second,wethOut),"APPROVE_SECOND");
  uint256 usdcOut=p.uniFirst?
    IS12913(AERO).exactInputSingle(IS12913.P(WETH,USDC,100,address(this),p.deadline,wethOut,p.minUsdc,0)):
    IU12913(UNI).exactInputSingle(IU12913.P(WETH,USDC,500,address(this),wethOut,p.minUsdc,0));
  require(usdcOut>=p.minUsdc,"SELL_MIN");
  // Deliberate fork probe: only reachable after both REAL router calls succeed.
  // The revert rolls back the complete loan and both swaps.
  if(p.probeAfterSwaps)revert BothSwapsReached(wethOut,usdcOut);
  // Require profit relative to initial balance and premium, prevents prefund masking losses.
  if(usdcOut<amount+premium+p.minProfit || IT12913(USDC).balanceOf(address(this))<initial+premium+p.minProfit)revert Unprofitable();
  require(IT12913(USDC).approve(POOL,0)&&IT12913(USDC).approve(POOL,amount+premium),"REPAY_APPROVE");
  return true;
 }
}
