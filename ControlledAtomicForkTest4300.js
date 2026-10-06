"use strict";
require("dotenv").config();
const hre=require("hardhat");
const fs=require("fs");
const ethers=hre.ethers;
const MORPHO="0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const AAVE_POOL="0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const WAD=10n**18n, SCALE=10n**36n;
const divUp=(n,d)=>(n===0n?0n:(n+d-1n)/d);
const mulDivDown=(x,y,d)=>x*y/d;
const mulDivUp=(x,y,d)=>divUp(x*y,d);
const wMulDown=(x,y)=>mulDivDown(x,y,WAD);
const wDivDown=(x,y)=>mulDivDown(x,WAD,y);
const wDivUp=(x,y)=>mulDivUp(x,WAD,y);
const toAssetsUp=(s,a,sh)=>divUp(s*(a+1n),sh+1000000n);
const toAssetsDown=(s,a,sh)=>s*(a+1n)/(sh+1000000n);
const toSharesUp=(a,ta,ts)=>divUp(a*(ts+1000000n),ta+1n);
const minBig=(a,b)=>a<b?a:b;
function lif(lltv){const cursor=300000000000000000n,max=1150000000000000000n;return minBig(max,wDivDown(WAD,WAD-wMulDown(cursor,WAD-lltv)));}
function bound(p,m,price,lltv){const bs=BigInt(p.borrowShares),c=BigInt(p.collateral),ta=BigInt(m.totalBorrowAssets),ts=BigInt(m.totalBorrowShares),l=lif(lltv);const full=toAssetsDown(bs,ta,ts);const seize=minBig(c,mulDivDown(wMulDown(full,l),SCALE,price));const quoted=mulDivUp(seize,price,SCALE);const repayQuoted=wDivUp(quoted,l);const rs=toSharesUp(repayQuoted,ta,ts);const repay=toAssetsUp(rs,ta,ts);return {seizedAssets:seize,repaidShares:rs,repaidAssets:repay,lif:l};}
function slot32(v){return ethers.zeroPadValue(ethers.toBeHex(v),32);}
// Production 0x quote execution is intentionally NOT used in this controlled fork test.
// A fork-only deterministic adapter exercises the executor callback/approval/swap/settlement mechanics.
// This must never be interpreted as production 0x quote validation.
async function main(){
 const candidate=JSON.parse(process.env.ARBIFLOW_CONTROLLED_CANDIDATE_JSON||"null");if(!candidate?.marketId||!candidate?.user) throw new Error("CONTROLLED_CANDIDATE_REQUIRED");
 const [tester]=await ethers.getSigners();const net=await ethers.provider.getNetwork();if(net.chainId!==8453n) throw new Error("BASE_FORK_REQUIRED");const sourceBlock=await ethers.provider.getBlockNumber();await hre.network.provider.send("evm_mine");
 const morpho=new ethers.Contract(MORPHO,["function idToMarketParams(bytes32) view returns(address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)","function accrueInterest((address,address,address,address,uint256))","function market(bytes32) view returns(uint128 totalSupplyAssets,uint128 totalSupplyShares,uint128 totalBorrowAssets,uint128 totalBorrowShares,uint128 lastUpdate,uint128 fee)","function position(bytes32,address) view returns(uint256 supplyShares,uint128 borrowShares,uint128 collateral)"],tester);
 const mp=await morpho.idToMarketParams(candidate.marketId);if(mp.loanToken===ethers.ZeroAddress) throw new Error("UNKNOWN_MARKET");
 await (await morpho.accrueInterest([mp.loanToken,mp.collateralToken,mp.oracle,mp.irm,mp.lltv])).wait();let m=await morpho.market(candidate.marketId),p=await morpho.position(candidate.marketId,candidate.user);const oracle=new ethers.Contract(mp.oracle,["function price() view returns(uint256)"],tester);const originalPrice=await oracle.price();let debt=toAssetsUp(BigInt(p.borrowShares),BigInt(m.totalBorrowAssets),BigInt(m.totalBorrowShares));let hf=BigInt(p.collateral)*originalPrice/SCALE*BigInt(mp.lltv)/debt;
 // Controlled fork-only oracle shock: replace oracle runtime with PUSH32 <price>; MSTORE(0); RETURN(0,32).
 const targetHf=BigInt(process.env.ARBIFLOW_CONTROLLED_TARGET_HF_WAD||"990000000000000000");const shockedPrice=originalPrice*targetHf/hf;const runtime="0x7f"+shockedPrice.toString(16).padStart(64,"0")+"60005260206000f3";await hre.network.provider.send("hardhat_setCode",[mp.oracle,runtime]);const shocked=await oracle.price();if(shocked!==shockedPrice) throw new Error("CONTROLLED_ORACLE_SHOCK_FAILED");
 await (await morpho.accrueInterest([mp.loanToken,mp.collateralToken,mp.oracle,mp.irm,mp.lltv])).wait();m=await morpho.market(candidate.marketId);p=await morpho.position(candidate.marketId,candidate.user);debt=toAssetsUp(BigInt(p.borrowShares),BigInt(m.totalBorrowAssets),BigInt(m.totalBorrowShares));hf=BigInt(p.collateral)*shocked/SCALE*BigInt(mp.lltv)/debt;if(hf>=WAD) throw new Error("CONTROLLED_POSITION_NOT_LIQUIDATABLE");const b=bound(p,m,shocked,BigInt(mp.lltv));
 const F=await ethers.getContractFactory("ArbiFlowAtomicExecutor430");const ex=await F.deploy(AAVE_POOL,MORPHO);await ex.waitForDeployment();const exAddr=await ex.getAddress();
 const Adapter=await ethers.getContractFactory("ControlledForkSwapAdapter431");const adapter=await Adapter.deploy();await adapter.waitForDeployment();const adapterAddr=await adapter.getAddress();
 const premiumBps=5n;const expectedPremium=divUp(b.repaidAssets*premiumBps,10000n);const syntheticProfitRaw=BigInt(process.env.ARBIFLOW_CONTROLLED_SYNTHETIC_PROFIT_RAW||"1");const syntheticBuyAmount=b.repaidAssets+expectedPremium+syntheticProfitRaw;
 // Fund only the disposable fork adapter with the loan token needed to emulate swap output.
 // hardhat_setBalance cannot fund ERC20, so copy token balance storage from a known Aave aToken reserve holder is avoided.
 // Instead impersonate the Aave pool and transfer loan tokens from the pool balance on the disposable fork only.
 await hre.network.provider.send("hardhat_impersonateAccount",[AAVE_POOL]);await hre.network.provider.send("hardhat_setBalance",[AAVE_POOL,"0x56BC75E2D63100000"]);
 const poolSigner=await ethers.getSigner(AAVE_POOL);const loan=new ethers.Contract(mp.loanToken,["function balanceOf(address) view returns(uint256)","function transfer(address,uint256) returns(bool)"],poolSigner);const poolBal=await loan.balanceOf(AAVE_POOL);if(poolBal<syntheticBuyAmount) throw new Error("CONTROLLED_FORK_AAVE_POOL_TOKEN_BALANCE_INSUFFICIENT_FOR_ADAPTER");await (await loan.transfer(adapterAddr,syntheticBuyAmount)).wait();await hre.network.provider.send("hardhat_stopImpersonatingAccount",[AAVE_POOL]);
 const adapterIface=Adapter.interface;const swapData=adapterIface.encodeFunctionData("swap",[mp.collateralToken,mp.loanToken,b.seizedAssets,syntheticBuyAmount,exAddr]);
 const plan={market:{loanToken:mp.loanToken,collateralToken:mp.collateralToken,oracle:mp.oracle,irm:mp.irm,lltv:mp.lltv},borrower:candidate.user,flashAmount:b.repaidAssets,seizedAssets:b.seizedAssets,minLoanAssetOut:syntheticBuyAmount,allowanceSpender:adapterAddr,swapTarget:adapterAddr,swapCalldata:swapData,profitRecipient:tester.address,minProfitRaw:syntheticProfitRaw};
 const gas=await ex.executeForkPlan.estimateGas(plan);const tx=await ex.executeForkPlan(plan);const rc=await tx.wait();
 const report={success:true,version:"4.31.0",testType:"CONTROLLED_DISPOSABLE_FORK_DETERMINISTIC_SWAP_ATOMIC_EXECUTION",stateClassification:"CONTROLLED_FORK_ONLY_TEST_MUTATION_NOT_CURRENT_MAINNET_STATE",productionZeroXQuoteValidated:false,productionQuoteGate:"UNRESOLVED_FORK_EXECUTOR_TAKER_NOT_MAINNET_DEPLOYED",deterministicSwapAdapterUsed:true,sourceForkBlockNumber:sourceBlock,marketId:candidate.marketId,borrower:candidate.user,originalOraclePrice:originalPrice.toString(),shockedOraclePrice:shocked.toString(),controlledHealthFactorWad:hf.toString(),exactRepaidAssetsRaw:b.repaidAssets.toString(),seizedAssetsRaw:b.seizedAssets.toString(),executor:exAddr,controlledSwapAdapter:adapterAddr,controlledSwapOutputRaw:syntheticBuyAmount.toString(),expectedAavePremiumRaw:expectedPremium.toString(),controlledResidualProfitRaw:syntheticProfitRaw.toString(),fullAtomicTransactionGasEstimate:gas.toString(),fullAtomicTransactionGasUsed:rc.gasUsed.toString(),atomicSimulationPerformed:true,paperPass:true,atomicLiquidationExecutedOnControlledFork:true,aaveFlashLoanPathAttempted:true,morphoLiquidationPathAttempted:true,deterministicForkSwapPathAttempted:true,aaveRepaymentPathAttempted:true,mainnetDeployment:false,mainnetBroadcast:false,mainnetStateChanged:false,fundsMovedOnMainnet:false,generatedAt:new Date().toISOString()};fs.writeFileSync(process.env.ARBIFLOW_CONTROLLED_REPORT||"controlled-atomic-report-4300.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
