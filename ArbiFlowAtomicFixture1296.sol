// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Isolated fixture for testing atomic callback mechanics. NOT a production executor.
/// @dev Only supports pool and swap fixtures supplied at deployment. Never deployed by the API.
interface IFixtureToken1296 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address,uint256) external returns (bool);
    function transferFrom(address,address,uint256) external returns (bool);
    function approve(address,uint256) external returns (bool);
}
interface IFixtureLender1296 {
    function flashLoanSimple(address receiver,address asset,uint256 amount,bytes calldata params,uint16 referralCode) external;
}
interface IFixtureSwap1296 {
    function swap(address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,address recipient) external returns (uint256);
}
contract ArbiFlowAtomicFixture1296 {
    error Unauthorized(); error InvalidPlan(); error BadCallback(); error BadSwap(); error Unprofitable(); error TransferFailed();
    address public immutable owner;
    address public immutable lender;
    address public immutable usdc;
    address public immutable weth;
    address public immutable venueA;
    address public immutable venueB;
    bool private active;
    struct Plan {uint256 amount; uint256 minWeth; uint256 minUsdc; uint256 minProfit; uint256 deadline; bool buyAtA;}
    event FixtureCompleted(uint256 principal,uint256 premium,uint256 profit);
    constructor(address _lender,address _usdc,address _weth,address _a,address _b) {
        require(_lender!=address(0)&&_usdc!=address(0)&&_weth!=address(0)&&_a!=address(0)&&_b!=address(0));
        owner=msg.sender; lender=_lender;usdc=_usdc;weth=_weth;venueA=_a;venueB=_b;
    }
    function runFixture(Plan calldata p) external {
        if(msg.sender!=owner)revert Unauthorized();
        if(active||p.amount==0||p.minWeth==0||p.minUsdc==0||p.minProfit==0||p.deadline<block.timestamp)revert InvalidPlan();
        active=true;
        IFixtureLender1296(lender).flashLoanSimple(address(this),usdc,p.amount,abi.encode(p),0);
        active=false;
    }
    function executeOperation(address asset,uint256 amount,uint256 premium,address initiator,bytes calldata params) external returns(bool) {
        if(msg.sender!=lender||!active||initiator!=address(this)||asset!=usdc)revert BadCallback();
        Plan memory p=abi.decode(params,(Plan));
        if(amount!=p.amount||block.timestamp>p.deadline)revert InvalidPlan();
        address buy=p.buyAtA?venueA:venueB;
        address sell=p.buyAtA?venueB:venueA;
        if(!IFixtureToken1296(usdc).approve(buy,0)||!IFixtureToken1296(usdc).approve(buy,amount))revert TransferFailed();
        uint256 wethOut=IFixtureSwap1296(buy).swap(usdc,weth,amount,p.minWeth,address(this));
        if(wethOut<p.minWeth)revert BadSwap();
        if(!IFixtureToken1296(weth).approve(sell,0)||!IFixtureToken1296(weth).approve(sell,wethOut))revert TransferFailed();
        uint256 usdcOut=IFixtureSwap1296(sell).swap(weth,usdc,wethOut,p.minUsdc,address(this));
        if(usdcOut<p.minUsdc)revert BadSwap();
        uint256 repay=amount+premium;
        if(usdcOut<repay+p.minProfit || IFixtureToken1296(usdc).balanceOf(address(this))<repay+p.minProfit)revert Unprofitable();
        if(!IFixtureToken1296(usdc).approve(lender,0)||!IFixtureToken1296(usdc).approve(lender,repay))revert TransferFailed();
        emit FixtureCompleted(amount,premium,usdcOut-repay);
        return true;
    }
}
