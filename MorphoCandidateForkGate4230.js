"use strict";
require("dotenv").config();
const hre = require("hardhat");
const fs = require("fs");
const ethers = hre.ethers;
const MORPHO = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const ORACLE_PRICE_SCALE = 10n ** 36n;
const WAD = 10n ** 18n;
function toAssetsUp(shares,totalAssets,totalShares){shares=BigInt(shares);totalAssets=BigInt(totalAssets);totalShares=BigInt(totalShares);const n=shares*(totalAssets+1n);const d=totalShares+1000000n;return n===0n?0n:(n+d-1n)/d;}
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
    results.push({marketId:c.marketId,user:c.user,exactAtForkBlock:true,forkAccruedStateConfirmed:true,borrowShares:p.borrowShares.toString(),collateralRaw:p.collateral.toString(),exactAccruedBorrowAssetsRaw:debt.toString(),oraclePrice:m.oraclePrice.toString(),lltv:m.params.lltv.toString(),exactAccruedHealthFactorWad:hf.toString(),exactAccruedLiquidatable:liquidatable,marketLastUpdateBefore:m.before.lastUpdate.toString(),marketLastUpdateAfter:m.after.lastUpdate.toString(),totalBorrowAssetsBefore:m.before.totalBorrowAssets.toString(),totalBorrowAssetsAfter:m.after.totalBorrowAssets.toString(),accrueInterestGasUsed:m.gasUsed.toString()});
  }
  const report={success:true,version:"4.23.0",source:"EPHEMERAL_BASE_FORK_BATCH_MORPHO_ACCRUAL",chainId:Number(network.chainId),sourceForkBlockNumber,protocolExecutionBlockNumber,localForkAdvanceBlocks:protocolExecutionBlockNumber-sourceForkBlockNumber,uniqueMarketsAccrued:uniqueMarkets.length,candidatesChecked:results.length,results,mainnetBroadcast:false,fundsMoved:false,generatedAt:new Date().toISOString()};
  const out=process.env.ARBIFLOW_MORPHO_GATE_REPORT||"morpho-candidate-gate-4230.json";
  fs.writeFileSync(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
