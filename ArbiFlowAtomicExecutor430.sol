// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20_430 {
    function balanceOf(address) external view returns (uint256);
    function approve(address,uint256) external returns (bool);
    function transfer(address,uint256) external returns (bool);
}

interface IAavePool430 {
    function flashLoanSimple(address receiverAddress,address asset,uint256 amount,bytes calldata params,uint16 referralCode) external;
}

interface IMorphoBlue430 {
    struct MarketParams { address loanToken; address collateralToken; address oracle; address irm; uint256 lltv; }
    function liquidate(MarketParams calldata marketParams,address borrower,uint256 seizedAssets,uint256 repaidShares,bytes calldata data) external returns (uint256,uint256);
}

contract ArbiFlowAtomicExecutor430 {
    error Unauthorized(); error InvalidCaller(); error InvalidInitiator(); error InvalidPlan(); error SwapFailed(); error ApprovalFailed(); error TransferFailed(); error InsufficientFlashRepayment(); error MinimumProfitNotMet(); error Reentrant();
    address public immutable OWNER; address public immutable AAVE_POOL; address public immutable MORPHO;
    bool private active;

    struct Plan {
        IMorphoBlue430.MarketParams market;
        address borrower;
        uint256 flashAmount;
        uint256 seizedAssets;
        uint256 minLoanAssetOut;
        address allowanceSpender;
        address swapTarget;
        bytes swapCalldata;
        address profitRecipient;
        uint256 minProfitRaw;
    }
    struct LiquidationContext { address loanToken; address collateralToken; uint256 collateralAmount; uint256 minLoanAssetOut; address allowanceSpender; address swapTarget; bytes swapCalldata; }

    constructor(address aavePool,address morpho){ if(aavePool==address(0)||morpho==address(0)) revert InvalidPlan(); OWNER=msg.sender; AAVE_POOL=aavePool; MORPHO=morpho; }

    function executeForkPlan(Plan calldata p) external {
        if(msg.sender!=OWNER) revert Unauthorized(); if(active) revert Reentrant();
        if(p.market.loanToken==address(0)||p.market.collateralToken==address(0)||p.borrower==address(0)||p.flashAmount==0||p.seizedAssets==0||p.minLoanAssetOut==0||p.allowanceSpender==address(0)||p.swapTarget==address(0)||p.swapCalldata.length==0||p.profitRecipient==address(0)) revert InvalidPlan();
        active=true;
        IAavePool430(AAVE_POOL).flashLoanSimple(address(this),p.market.loanToken,p.flashAmount,abi.encode(p),0);
        active=false;
    }

    function executeOperation(address asset,uint256 amount,uint256 premium,address initiator,bytes calldata params) external returns(bool){
        if(msg.sender!=AAVE_POOL) revert InvalidCaller(); if(initiator!=address(this)) revert InvalidInitiator(); if(!active) revert Reentrant();
        Plan memory p=abi.decode(params,(Plan)); if(asset!=p.market.loanToken||amount!=p.flashAmount) revert InvalidPlan();
        LiquidationContext memory c=LiquidationContext(p.market.loanToken,p.market.collateralToken,p.seizedAssets,p.minLoanAssetOut,p.allowanceSpender,p.swapTarget,p.swapCalldata);
        IMorphoBlue430(MORPHO).liquidate(p.market,p.borrower,p.seizedAssets,0,abi.encode(c));
        uint256 owed=amount+premium; uint256 bal=IERC20_430(asset).balanceOf(address(this)); if(bal<owed) revert InsufficientFlashRepayment();
        uint256 profit=bal-owed; if(profit<p.minProfitRaw) revert MinimumProfitNotMet();
        _approve(asset,AAVE_POOL,0); _approve(asset,AAVE_POOL,owed);
        if(profit>0&&!IERC20_430(asset).transfer(p.profitRecipient,profit)) revert TransferFailed();
        return true;
    }

    function onMorphoLiquidate(uint256 repaidAssets,bytes calldata data) external {
        if(msg.sender!=MORPHO) revert InvalidCaller(); if(!active) revert Reentrant();
        LiquidationContext memory c=abi.decode(data,(LiquidationContext));
        uint256 collateral=IERC20_430(c.collateralToken).balanceOf(address(this)); if(c.collateralAmount==0||collateral<c.collateralAmount) revert InvalidPlan();
        uint256 beforeBal=IERC20_430(c.loanToken).balanceOf(address(this));
        _approve(c.collateralToken,c.allowanceSpender,0); _approve(c.collateralToken,c.allowanceSpender,c.collateralAmount);
        (bool ok,)=c.swapTarget.call(c.swapCalldata); if(!ok) revert SwapFailed();
        _approve(c.collateralToken,c.allowanceSpender,0);
        uint256 afterBal=IERC20_430(c.loanToken).balanceOf(address(this)); if(afterBal<beforeBal+c.minLoanAssetOut) revert MinimumProfitNotMet();
        _approve(c.loanToken,MORPHO,0); _approve(c.loanToken,MORPHO,repaidAssets);
    }

    function _approve(address token,address spender,uint256 amount) internal { if(!IERC20_430(token).approve(spender,amount)) revert ApprovalFailed(); }
}
