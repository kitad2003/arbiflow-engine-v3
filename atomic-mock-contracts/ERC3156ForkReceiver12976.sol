// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface I3156Lender {function maxFlashLoan(address) external view returns(uint256);function flashFee(address,uint256) external view returns(uint256);function flashLoan(address,address,uint256,bytes calldata) external returns(bool);}
interface IERC20Mint {function balanceOf(address) external view returns(uint256);function approve(address,uint256) external returns(bool);}
contract ERC3156ForkReceiver12976 {
 address public immutable owner;address public immutable lender;address public immutable token;
 bytes32 constant SUCCESS=keccak256("ERC3156FlashBorrower.onFlashLoan");
 uint256 public callbackCount;uint256 public lastAmount;uint256 public lastFee;
 constructor(address l,address t){owner=msg.sender;lender=l;token=t;}
 function start(uint256 amount) external {
  require(msg.sender==owner,"ONLY_OWNER");
  require(amount>0&&amount<=I3156Lender(lender).maxFlashLoan(token),"CAPACITY");
  require(I3156Lender(lender).flashLoan(address(this),token,amount,""),"LENDER_FALSE");
 }
 function onFlashLoan(address initiator,address asset,uint256 amount,uint256 fee,bytes calldata data) external returns(bytes32){
  require(msg.sender==lender,"UNTRUSTED_LENDER");
  require(initiator==address(this),"UNTRUSTED_INITIATOR");
  require(asset==token,"WRONG_TOKEN");
  require(data.length==0,"UNEXPECTED_PAYLOAD");
  uint256 bal=IERC20Mint(token).balanceOf(address(this));
  require(bal>=amount+fee,"FEE_FUNDS_MISSING");
  require(IERC20Mint(token).approve(lender,amount+fee),"APPROVAL_FAILED");
  callbackCount++;lastAmount=amount;lastFee=fee;
  return SUCCESS;
 }
}
