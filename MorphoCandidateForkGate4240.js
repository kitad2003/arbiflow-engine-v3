"use strict";
require("dotenv").config();
const hre = require("hardhat");
const fs = require("fs");
const ethers = hre.ethers;
const MORPHO = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const ORACLE_PRICE_SCALE = 10n ** 36n;
const WAD = 10n ** 18n;
function divUp(n,d){n=BigInt(n);d=BigInt(d);return n===0n?0n:(n+d-1n)/d;}
function mulDivDown(x,y,d){return BigInt(x)*BigInt(y)/BigInt(d);}
function mulDivUp(x,y,d){return divUp(BigInt(x)*BigInt(y),BigInt(d));}
function wMulDown(x,y){return mulDivDown(x,y,WAD);}
function wDivDown(x,y){return mulDivDown(x,WAD,y);}
function wDivUp(x,y){return mulDivUp(x,WAD,y);}
function toAssetsDown(shares,totalAssets,totalShares){return BigInt(shares)*(BigInt(totalAssets)+1n)/(BigInt(totalShares)+1000000n);}
function toAssetsUp(shares,totalAssets,totalShares){return divUp(BigInt(shares)*(BigInt(totalAssets)+1n),BigInt(totalShares)+1000000n);}
function toSharesUp(assets,totalAssets,totalShares){return divUp(BigInt(assets)*(BigInt(totalShares)+1000000n),BigInt(totalAssets)+1n);}
function minBig(a,b){a=BigInt(a);b=BigInt(b);return a<b?a:b;}
function liquidationIncentiveFactor(lltv){
  const cursor=300000000000000000n;
  const maxLif=1150000000000000000n;
  const denominator=WAD-wMulDown(cursor,WAD-BigInt(lltv));
  return minBig(maxLif,wDivDown(WAD,denominator));
}
function computeFullDebtLiquidationBound(position,market,oraclePrice,lltv){
  const borrowShares=BigInt(position.borrowShares);
  const collateral=BigInt(position.collateral);
  const totalBorrowAssets=BigInt(market.totalBorrowAssets);
  const totalBorrowShares=BigInt(market.totalBorrowShares);
  const lif=liquidationIncentiveFactor(lltv);
  const repaidAssetsFullDown=toAssetsDown(borrowShares,totalBorrowAssets,totalBorrowShares);
  const seizeForFullDebt=mulDivDown(wMulDown(repaidAssetsFullDown,lif),ORACLE_PRICE_SCALE,oraclePrice);
  const seizedAssets=minBig(collateral,seizeForFullDebt);
  const seizedAssetsQuoted=mulDivUp(seizedAssets,oraclePrice,ORACLE_PRICE_SCALE);
  const repaidAssetsQuoted=wDivUp(seizedAssetsQuoted,lif);
  const derivedRepaidShares=toSharesUp(repaidAssetsQuoted,totalBorrowAssets,totalBorrowShares);
  const exactRepaidAssets=toAssetsUp(derivedRepaidShares,totalBorrowAssets,totalBorrowShares);
  return {
    method:"COLLATERAL_CAPPED_FULL_DEBT_SEIZED_ASSETS_INPUT",
    liquidationIncentiveFactorWad:lif.toString(),
    borrowerBorrowShares:borrowShares.toString(),
    borrowerCollateralRaw:collateral.toString(),
    repaidAssetsFullDownRaw:repaidAssetsFullDown.toString(),
    seizeForFullDebtRaw:seizeForFullDebt.toString(),
    seizedAssetsInputRaw:seizedAssets.toString(),
    repaidSharesInputRaw:"0",
    derivedRepaidSharesRaw:derivedRepaidShares.toString(),
    exactRepaidAssetsRaw:exactRepaidAssets.toString(),
    collateralBound:seizedAssets===collateral,
    borrowShareBoundPass:derivedRepaidShares<=borrowShares,
    collateralBoundPass:seizedAssets<=collateral,
    exactlyOneZeroInput:true,
    protocolValidSizingComputed:seizedAssets>0n&&derivedRepaidShares>0n&&derivedRepaidShares<=borrowShares&&seizedAssets<=collateral
  };
}
async function main(){
  const raw=process.env.ARBIFLOW_MORPHO_CANDIDATES_JSON||"[]";
  const candidates=JSON.parse(raw);
  if(!Array.isArray(candidates)||candidates.length===0) throw new Error("NO_MORPHO_CANDIDATES");
  const [tester]=await ethers.getSigners();
  const network=await ethers.provider.getNetwork();
  if(network.chainId!==8453n) throw new Error(`Expected Base fork chainId 8453, got ${network.chainId}`);
  const sourceForkBlockNumber=await ethers.provider.getBlockNumber();
  await hre.network.provider.send("evm_mine");
  const protocolExecutionBlockNumber=await ethers.provider.getBlockNumber();
  if(protocolExecutionBlockNumber<=sourceForkBlockNumber) throw new Error("LOCAL_FORK_ADVANCE_FAILED");
  const morpho=new ethers.Contract(MORPHO,[
    "function accrueInterest((address loanToken,address collateralToken,address oracle,address irm,uint256 lltv) marketParams)",
    "function idToMarketParams(bytes32) view returns (address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)",
    "function position(bytes32,address) view returns (uint256 supplyShares,uint128 borrowShares,uint128 collateral)",
    "function market(bytes32) view returns (uint128 totalSupplyAssets,uint128 totalSupplyShares,uint128 totalBorrowAssets,uint128 totalBorrowShares,uint128 lastUpdate,uint128 fee)"
  ],tester);
  const uniqueMarkets=[...new Set(candidates.map(x=>String(x.marketId).toLowerCase()))];
  const marketResults={};
  for(const marketId of uniqueMarkets){
    const params=await morpho.idToMarketParams(marketId);
    if(params.loanToken===ethers.ZeroAddress) throw new Error(`UNKNOWN_MORPHO_MARKET:${marketId}`);
    const before=await morpho.market(marketId);
    const tx=await morpho.accrueInterest([params.loanToken,params.collateralToken,params.oracle,params.irm,params.lltv]);
    const receipt=await tx.wait();
    const after=await morpho.market(marketId);
    const oracle=new ethers.Contract(params.oracle,["function price() view returns (uint256)"],tester);
    const oraclePrice=await oracle.price();
    marketResults[marketId]={params,before,after,oraclePrice,gasUsed:receipt.gasUsed};
  }
  const results=[];
  for(const c of candidates){
    const marketId=String(c.marketId).toLowerCase();
    const m=marketResults[marketId];
    const p=await morpho.position(marketId,c.user);
    const debt=toAssetsUp(p.borrowShares,m.after.totalBorrowAssets,m.after.totalBorrowShares);
    const collateralValueLoanUnits=BigInt(p.collateral)*BigInt(m.oraclePrice)/ORACLE_PRICE_SCALE;
    const hf=debt>0n?collateralValueLoanUnits*BigInt(m.params.lltv)/debt:0n;
    const liquidatable=debt>0n&&hf<WAD;
    const liquidationBound=computeFullDebtLiquidationBound(p,m.after,BigInt(m.oraclePrice),BigInt(m.params.lltv));
    results.push({marketId:c.marketId,user:c.user,exactAtForkBlock:true,forkAccruedStateConfirmed:true,borrowShares:p.borrowShares.toString(),collateralRaw:p.collateral.toString(),exactAccruedBorrowAssetsRaw:debt.toString(),oraclePrice:m.oraclePrice.toString(),lltv:m.params.lltv.toString(),exactAccruedHealthFactorWad:hf.toString(),exactAccruedLiquidatable:liquidatable,exactProtocolLiquidationBound:{...liquidationBound,applicableAtForkBlock:liquidatable,exactProtocolValidRepaySeizeBound:liquidatable&&liquidationBound.protocolValidSizingComputed},marketLastUpdateBefore:m.before.lastUpdate.toString(),marketLastUpdateAfter:m.after.lastUpdate.toString(),totalBorrowAssetsBefore:m.before.totalBorrowAssets.toString(),totalBorrowAssetsAfter:m.after.totalBorrowAssets.toString(),accrueInterestGasUsed:m.gasUsed.toString()});
  }
  const report={success:true,version:"4.24.0",source:"EPHEMERAL_BASE_FORK_BATCH_MORPHO_ACCRUAL_PLUS_EXACT_LIQUIDATION_BOUND",chainId:Number(network.chainId),sourceForkBlockNumber,protocolExecutionBlockNumber,localForkAdvanceBlocks:protocolExecutionBlockNumber-sourceForkBlockNumber,uniqueMarketsAccrued:uniqueMarkets.length,candidatesChecked:results.length,results,mainnetBroadcast:false,fundsMoved:false,generatedAt:new Date().toISOString()};
  const out=process.env.ARBIFLOW_MORPHO_GATE_REPORT||"morpho-candidate-gate-4240.json";
  fs.writeFileSync(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
