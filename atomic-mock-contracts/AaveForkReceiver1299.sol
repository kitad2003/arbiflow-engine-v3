// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IAaveFlashPool1299 {
 function flashLoanSimple(address receiver,address asset,uint256 amount,bytes calldata params,uint16 referralCode) external;
}
interface IERC20Fork1299 {
 function approve(address spender,uint256 amount) external returns(bool);
 function balanceOf(address) external view returns(uint256);
}
/// @notice Disposable Base fork Aave callback test. NEVER deployed to mainnet by app.
contract AaveForkReceiver1299 {
 address public immutable pool;
 address public immutable usdc;
 address public immutable owner;
 error Unauthorized();
 error BadCallback();
 error UnfundedPremium();
 constructor(address _pool,address _usdc){require(_pool!=address(0)&&_usdc!=address(0));pool=_pool;usdc=_usdc;owner=msg.sender;}
 function start(uint256 amount) external {
   if(msg.sender!=owner||amount==0)revert Unauthorized();
   IAaveFlashPool1299(pool).flashLoanSimple(address(this),usdc,amount,"",0);
 }
 function executeOperation(address asset,uint256 amount,uint256 premium,address initiator,bytes calldata) external returns(bool){
   if(msg.sender!=pool||asset!=usdc||initiator!=address(this))revert BadCallback();
   if(IERC20Fork1299(usdc).balanceOf(address(this))<amount+premium)revert UnfundedPremium();
   require(IERC20Fork1299(usdc).approve(pool,0),"RESET_APPROVAL_FAILED");
   require(IERC20Fork1299(usdc).approve(pool,amount+premium),"APPROVAL_FAILED");
   return true;
 }
}
