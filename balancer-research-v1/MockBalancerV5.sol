// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// Deterministic mock for unit tests ONLY. Not an executable DEX quote or proof of profit.
interface IV5Token {function balanceOf(address) external view returns(uint256);function transfer(address,uint256) external returns(bool);function transferFrom(address,address,uint256) external returns(bool);}
interface IV5Callback {function receiveFlashLoan(IV5Token[] memory,uint256[] memory,uint256[] memory,bytes memory) external;}
contract ResearchTokenV5 {
 mapping(address=>uint256) public balanceOf;
 mapping(address=>mapping(address=>uint256)) public allowance;
 function mint(address to,uint256 value) external {balanceOf[to]+=value;}
 function approve(address spender,uint256 value) external returns(bool){allowance[msg.sender][spender]=value;return true;}
 function transfer(address to,uint256 value) external returns(bool){require(balanceOf[msg.sender]>=value,"TOKEN_BALANCE");balanceOf[msg.sender]-=value;balanceOf[to]+=value;return true;}
 function transferFrom(address from,address to,uint256 value) external returns(bool){require(allowance[from][msg.sender]>=value,"TOKEN_ALLOWANCE");allowance[from][msg.sender]-=value;require(balanceOf[from]>=value,"TOKEN_BALANCE");balanceOf[from]-=value;balanceOf[to]+=value;return true;}
}
contract MockBalancerVaultV5 {
 uint256 public immutable feeBps;
 constructor(uint256 bps){require(bps<=10000,"BAD_FEE");feeBps=bps;}
 function flashLoan(address recipient,IV5Token[] calldata tokens,uint256[] calldata amounts,bytes calldata data) external {
  require(tokens.length==1&&amounts.length==1,"SINGLE_ASSET_ONLY");
  uint256 beforeBal=tokens[0].balanceOf(address(this));
  require(beforeBal>=amounts[0],"VAULT_LIQUIDITY");
  uint256 fee=(amounts[0]*feeBps+9999)/10000;
  require(tokens[0].transfer(recipient,amounts[0]),"LOAN_TRANSFER");
  uint256[] memory fees=new uint256[](1);fees[0]=fee;
  IV5Callback(recipient).receiveFlashLoan(tokens,amounts,fees,data);
  require(tokens[0].balanceOf(address(this))>=beforeBal+fee,"NOT_REPAID");
 }
}
contract MockFixedRateRouterV5 {
 uint256 public immutable numerator;
 uint256 public immutable denominator;
 constructor(uint256 n,uint256 d){require(n>0&&d>0,"BAD_RATE");numerator=n;denominator=d;}
 function swapExact(address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,address recipient) external returns(uint256){
  uint256 amountOut=amountIn*numerator/denominator;
  require(amountOut>=minOut,"MIN_OUT");
  require(IV5Token(tokenIn).transferFrom(msg.sender,address(this),amountIn),"TAKE_INPUT");
  require(IV5Token(tokenOut).transfer(recipient,amountOut),"PAY_OUTPUT");
  return amountOut;
 }
}
