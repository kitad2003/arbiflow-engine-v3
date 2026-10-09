// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "./ArbiFlowAtomicFixture1296.sol";
contract MockToken1297 is IFixtureToken1296 {
    mapping(address=>uint256) public override balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    function mint(address to,uint256 amount) external {balanceOf[to]+=amount;}
    function transfer(address to,uint256 amount) external returns(bool) {require(balanceOf[msg.sender]>=amount,"BALANCE");balanceOf[msg.sender]-=amount;balanceOf[to]+=amount;return true;}
    function approve(address spender,uint256 amount) external returns(bool) {allowance[msg.sender][spender]=amount;return true;}
    function transferFrom(address from,address to,uint256 amount) external returns(bool) {require(balanceOf[from]>=amount&&allowance[from][msg.sender]>=amount,"ALLOWANCE");allowance[from][msg.sender]-=amount;balanceOf[from]-=amount;balanceOf[to]+=amount;return true;}
}
contract MockVenue1297 is IFixtureSwap1296 {
    uint256 public rateNum;
    uint256 public rateDen;
    constructor(uint256 n,uint256 d) {require(d>0);rateNum=n;rateDen=d;}
    function swap(address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,address recipient) external returns(uint256 out){
        out=amountIn*rateNum/rateDen;require(out>=minOut,"MIN_OUT");
        require(IFixtureToken1296(tokenIn).transferFrom(msg.sender,address(this),amountIn),"PAY");
        require(IFixtureToken1296(tokenOut).transfer(recipient,out),"PAYOUT");
    }
}
contract MockLender1297 is IFixtureLender1296 {
    uint256 public constant PREMIUM_BPS=5;
    function flashLoanSimple(address receiver,address asset,uint256 amount,bytes calldata params,uint16) external {
        uint256 fee=(amount*PREMIUM_BPS+9999)/10000;
        require(IFixtureToken1296(asset).transfer(receiver,amount),"SEND");
        require(ArbiFlowAtomicFixture1296(receiver).executeOperation(asset,amount,fee,msg.sender,params),"CALLBACK");
        require(IFixtureToken1296(asset).transferFrom(receiver,address(this),amount+fee),"REPAY");
    }
}
