// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Entirely isolated testing contracts. None are production DEX or lender integrations.
contract ControlToken12984 {
 string public name; string public symbol; uint8 public immutable decimals;
 mapping(address=>uint256) public balanceOf; mapping(address=>mapping(address=>uint256)) public allowance;
 constructor(string memory n,string memory s,uint8 d){name=n;symbol=s;decimals=d;}
 function mint(address to,uint256 amount) external {balanceOf[to]+=amount;}
 function approve(address to,uint256 amount) external returns(bool){allowance[msg.sender][to]=amount;return true;}
 function transfer(address to,uint256 amount) external returns(bool){require(balanceOf[msg.sender]>=amount,"BALANCE");balanceOf[msg.sender]-=amount;balanceOf[to]+=amount;return true;}
 function transferFrom(address from,address to,uint256 amount) external returns(bool){uint256 a=allowance[from][msg.sender];require(a>=amount,"ALLOWANCE");allowance[from][msg.sender]=a-amount;require(balanceOf[from]>=amount,"BALANCE");balanceOf[from]-=amount;balanceOf[to]+=amount;return true;}
}
contract ConstantProductPool12984 {
 ControlToken12984 public immutable usd;ControlToken12984 public immutable eth;
 uint256 public reserveUSD;uint256 public reserveETH;
 constructor(address u,address e){usd=ControlToken12984(u);eth=ControlToken12984(e);}
 function seed(uint256 u,uint256 e) external {require(reserveUSD==0&&reserveETH==0,"SEEDED");require(usd.transferFrom(msg.sender,address(this),u));require(eth.transferFrom(msg.sender,address(this),e));reserveUSD=u;reserveETH=e;}
 function quote(uint256 amount,uint256 rin,uint256 rout) public pure returns(uint256){uint256 afterFee=amount*9970;return afterFee*rout/(rin*10000+afterFee);}
 function buyETH(uint256 amount,uint256 minOut) external returns(uint256 out){out=quote(amount,reserveUSD,reserveETH);require(out>=minOut&&out>0,"SLIPPAGE");require(usd.transferFrom(msg.sender,address(this),amount));reserveUSD+=amount;reserveETH-=out;require(eth.transfer(msg.sender,out));}
 function sellETH(uint256 amount,uint256 minOut) external returns(uint256 out){out=quote(amount,reserveETH,reserveUSD);require(out>=minOut&&out>0,"SLIPPAGE");require(eth.transferFrom(msg.sender,address(this),amount));reserveETH+=amount;reserveUSD-=out;require(usd.transfer(msg.sender,out));}
}
interface IFlashBorrower12984{function onLoan(uint256 principal,uint256 fee) external;}
contract LoanFixture12984 {
 ControlToken12984 public immutable usd;uint256 public constant feeBps=5;
 constructor(address u){usd=ControlToken12984(u);}
 function flash(address receiver,uint256 amount) external {
  uint256 prior=usd.balanceOf(address(this));require(prior>=amount,"LIQUIDITY");
  uint256 fee=(amount*feeBps+9999)/10000;
  require(usd.transfer(receiver,amount));
  IFlashBorrower12984(receiver).onLoan(amount,fee);
  require(usd.balanceOf(address(this))>=prior+fee,"NOT_REPAID");
 }
}
contract AtomicController12984 is IFlashBorrower12984 {
 ControlToken12984 public immutable usd;ControlToken12984 public immutable eth;
 LoanFixture12984 public immutable lender;ConstantProductPool12984 public immutable buy;ConstantProductPool12984 public immutable sell;
 address public immutable owner;bool private active;uint256 private minProfit;uint256 private minEth;uint256 private minUsd;
 event Executed(uint256 borrowed,uint256 repaid,uint256 remainingUSDC);
 constructor(address u,address e,address l,address a,address b){usd=ControlToken12984(u);eth=ControlToken12984(e);lender=LoanFixture12984(l);buy=ConstantProductPool12984(a);sell=ConstantProductPool12984(b);owner=msg.sender;}
 function run(uint256 amount,uint256 minEthOut,uint256 minUsdOut,uint256 profitRequired) external {
  require(msg.sender==owner,"OWNER");require(!active,"ACTIVE");
  active=true;minProfit=profitRequired;minEth=minEthOut;minUsd=minUsdOut;
  lender.flash(address(this),amount);active=false;
 }
 function onLoan(uint256 amount,uint256 fee) external {
  require(msg.sender==address(lender)&&active,"CALLBACK");
  require(usd.balanceOf(address(this))==amount,"UNEXPECTED_USD_BALANCE");
  require(eth.balanceOf(address(this))==0,"UNEXPECTED_ETH_BALANCE");
  usd.approve(address(buy),amount);
  uint256 receivedETH=buy.buyETH(amount,minEth);
  eth.approve(address(sell),receivedETH);
  uint256 receivedUSD=sell.sellETH(receivedETH,minUsd);
  uint256 repay=amount+fee;
  require(receivedUSD>=repay+minProfit,"PROFIT_GATE");
  require(usd.transfer(address(lender),repay));
  emit Executed(amount,repay,receivedUSD-repay);
 }
}
