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
// KyberSwap integration test: route/build is requested for the fork-deployed executor.
 // The resulting router calldata is executed only on the disposable Base fork.
 // No mainnet transaction is signed or broadcast.
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
 const premiumBps=5n;const expectedPremium=divUp(b.repaidAssets*premiumBps,10000n);
 const requiredOut=b.repaidAssets+expectedPremium+BigInt(process.env.ARBIFLOW_CONTROLLED_SYNTHETIC_PROFIT_RAW||"1");
 const clientId=(process.env.ARBIFLOW_KYBER_CLIENT_ID||"ArbiFlow").trim()||"ArbiFlow";
 const headers={"X-Client-Id":clientId,"Accept":"application/json"};
 const request=async(url,options={})=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);try{const r=await fetch(url,{...options,headers:{...headers,...(options.headers||{})},signal:c.signal});const body=await r.text();let data=null;try{data=JSON.parse(body)}catch{}return {ok:r.ok,status:r.status,body,data}}finally{clearTimeout(t)}};
 const route=await request("https://aggregator-api.kyberswap.com/base/api/v1/routes?"+new URLSearchParams({tokenIn:mp.collateralToken,tokenOut:mp.loanToken,amountIn:b.seizedAssets.toString(),excludeRFQSources:"true",onlyScalableSources:"true",gasInclude:"true"}));
 const summary=route.data?.data?.routeSummary||null,routeRouter=route.data?.data?.routerAddress||null;
 if(!route.ok||!summary?.amountOut||!routeRouter) throw new Error(`KYBER_ROUTE_FAILED:${route.status}:${route.data?.message||route.body.slice(0,300)}`);
 if(BigInt(summary.amountOut)<requiredOut) throw new Error(`KYBER_ROUTE_OUTPUT_BELOW_ATOMIC_REQUIREMENT:${summary.amountOut}:${requiredOut}`);
 const build=await request("https://aggregator-api.kyberswap.com/base/api/v1/route/build",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({routeSummary:summary,sender:exAddr,recipient:exAddr,slippageTolerance:Number(process.env.ARBIFLOW_KYBER_SLIPPAGE_BPS||50),enableGasEstimation:false,source:"ArbiFlow"})});
 const kd=build.data?.data||null,swapData=kd?.data||null,swapTarget=kd?.routerAddress||null;
 if(!build.ok||!swapData||!/^0x[0-9a-fA-F]+$/.test(swapData)||!/^0x[a-fA-F0-9]{40}$/.test(swapTarget||"")) throw new Error(`KYBER_BUILD_FAILED:${build.status}:${build.data?.message||build.body.slice(0,300)}`);
 if(swapTarget.toLowerCase()!==routeRouter.toLowerCase()) throw new Error("KYBER_ROUTER_MISMATCH");
 // Kyber's official Aggregator API specifies the route routerAddress as the permit/approval spender.
 const allowanceSpender=routeRouter;
 const minLoanAssetOut=requiredOut;
 const plan={market:{loanToken:mp.loanToken,collateralToken:mp.collateralToken,oracle:mp.oracle,irm:mp.irm,lltv:mp.lltv},borrower:candidate.user,flashAmount:b.repaidAssets,seizedAssets:b.seizedAssets,minLoanAssetOut,allowanceSpender,swapTarget,swapCalldata:swapData,profitRecipient:tester.address,minProfitRaw:1n};
 const gas=await ex.executeForkPlan.estimateGas(plan);const tx=await ex.executeForkPlan(plan);const rc=await tx.wait();
 const postBal=await new ethers.Contract(mp.loanToken,["function balanceOf(address) view returns(uint256)"],tester).balanceOf(tester.address);
 const report={success:true,version:"4.35.0",testType:"CONTROLLED_DISPOSABLE_FORK_KYBERSWAP_ATOMIC_EXECUTION",stateClassification:"CONTROLLED_FORK_ONLY_TEST_MUTATION_NOT_CURRENT_MAINNET_STATE",kyberRouteValidated:true,kyberBuildValidated:true,kyberCalldataExecutedOnFork:true,kyberCalldataExposed:false,deterministicSwapAdapterUsed:false,sourceForkBlockNumber:sourceBlock,marketId:candidate.marketId,borrower:candidate.user,originalOraclePrice:originalPrice.toString(),shockedOraclePrice:shocked.toString(),controlledHealthFactorWad:hf.toString(),exactRepaidAssetsRaw:b.repaidAssets.toString(),seizedAssetsRaw:b.seizedAssets.toString(),executor:exAddr,kyberRouter:swapTarget,approvalSpender:allowanceSpender,routeQuotedOutputRaw:summary.amountOut,builtOutputRaw:kd.amountOut??null,requiredAtomicOutputRaw:requiredOut.toString(),expectedAavePremiumRaw:expectedPremium.toString(),fullAtomicTransactionGasEstimate:gas.toString(),fullAtomicTransactionGasUsed:rc.gasUsed.toString(),atomicSimulationPerformed:true,paperPass:true,atomicLiquidationExecutedOnControlledFork:true,aaveFlashLoanPathAttempted:true,morphoLiquidationPathAttempted:true,kyberSwapPathAttempted:true,aaveRepaymentPathAttempted:true,productionExecutorBound:false,productionExecutionValidated:false,mainnetDeployment:false,mainnetBroadcast:false,mainnetStateChanged:false,fundsMovedOnMainnet:false,generatedAt:new Date().toISOString()};fs.writeFileSync(process.env.ARBIFLOW_CONTROLLED_REPORT||"controlled-kyber-atomic-report-4350.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
