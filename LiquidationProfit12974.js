'use strict';
// ArbiFlow 12.9.74: read-only Aave collateral/debt and liquidation incentive evidence.
// Nothing is liquidated or broadcast. No positive profit without an atomic fork.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {run:discover}=require('./LiquidationIntelligence12973');
const POOL='0xA238Dd80C259a72e81d7e4664a9801593F98d1';
const P=['function getReservesList() view returns(address[])','function getReserveData(address) view returns(((uint256 data) configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))',
'function getUserAccountData(address) view returns(uint256,uint256,uint256,uint256,uint256,uint256)'];
const TOKEN=['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','function symbol() view returns(string)'];
const CAP=Number(process.env.LIQUIDATION_INVESTIGATE_LIMIT||12);
function decodeConfiguration(raw){const x=BigInt(raw);return {liquidationThresholdBps:Number((x>>16n)&65535n),liquidationBonusBps:Number((x>>32n)&65535n),decimals:Number((x>>48n)&255n),active:((x>>56n)&1n)===1n,frozen:((x>>57n)&1n)===1n};}
function fail(e){return String(e?.shortMessage||e?.message||e).slice(0,130)}
async function main(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');assert(Number.isInteger(CAP)&&CAP>0&&CAP<=100,'INVALID_LIMIT');
 // Run preceding evidence scan; do not use stale borrower health factors.
 const discovery=await discover(rpc),p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true}),errors=[];
 try{
  const block=await p.getBlockNumber(),c=new ethers.Contract(POOL,P,p),reserveAddresses=await c.getReservesList({blockTag:block}),reserves=[];
  for(const asset of reserveAddresses){
   try{
    const data=await c.getReserveData(asset,{blockTag:block}),conf=decodeConfiguration(data.configuration.data),t=new ethers.Contract(asset,TOKEN,p);
    let symbol=null;try{symbol=await t.symbol({blockTag:block})}catch{}
    reserves.push({asset,symbol,configuration:conf,aToken:data.aTokenAddress,variableDebtToken:data.variableDebtTokenAddress});
   }catch(e){errors.push({stage:'RESERVE',asset,error:fail(e)})}
  }
  const lowest=discovery.topLowestHealth.filter(x=>x.hasDebt).slice(0,CAP),positions=[];
  for(const user of lowest){
   const account=await c.getUserAccountData(user,{blockTag:block}),hf=Number(account[5])/1e18,assets=[];
   for(const reserve of reserves){
    try{
     const at=new ethers.Contract(reserve.aToken,TOKEN,p),vt=new ethers.Contract(reserve.variableDebtToken,TOKEN,p);
     const [collateral,debt]=await Promise.all([at.balanceOf(user,{blockTag:block}),vt.balanceOf(user,{blockTag:block})]);
     if(collateral>0n||debt>0n)assets.push({symbol:reserve.symbol,asset:reserve.asset,collateralRaw:collateral.toString(),variableDebtRaw:debt.toString(),liquidationBonusBps:reserve.configuration.liquidationBonusBps,liquidationThresholdBps:reserve.configuration.liquidationThresholdBps});
    }catch(e){errors.push({stage:'POSITION_ASSET',user,asset:reserve.asset,error:fail(e)})}
   }
   positions.push({user,healthFactor:hf,liquidatable:BigInt(account[1])>0n&&BigInt(account[5])<10n**18n,totalDebtBaseRaw:account[1].toString(),assets,liquidationProfitVerified:false,reason:'Collateral and debt detection only; eligible repayment, liquidation fee, collateral sale and fork are not yet verified'});
  }
  const out={build:'12.9.74',mode:'AAVE_POSITION_AND_BONUS_INVESTIGATION_READ_ONLY',block,discoveryBlock:discovery.block,
   discoveryComplete:discovery.scanComplete,borrowersDiscovered:discovery.candidatesDiscovered,nearLiquidation:discovery.nearLiquidation,
   trackedPositions:positions.length,liquidatable:positions.filter(x=>x.liquidatable).length,reserves:reserves.map(x=>({asset:x.asset,symbol:x.symbol,configuration:x.configuration})),
   positions,errors,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false,
   limitations:['AAVE_VARIABLE_DEBT_ONLY_STABLE_DEBT_NOT_ACCOUNTED_FOR_IN_ASSET_BREAKDOWN','ATOKEN_BALANCE_NOT_PROOF_RESERVE_USED_AS_COLLATERAL','NO_PROTOCOL_LIQUIDATION_FEE_CALCULATION','NO_EXACT_COLLATERAL_SWAP_QUOTES','NO_HARDHAT_ATOMIC_EXECUTION','NO_GAS_COSTS','BORROWER_SAMPLE_FROM_RECENT_ACTIVITY']};
  fs.writeFileSync('arbiflow-liquidation-profit-investigation-12974.json',JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify({...out,positions:positions.map(x=>({...x,assets:x.assets.slice(0,8)}))}));return out;
 }finally{p.destroy()}
}
if(require.main===module){assert.equal(decodeConfiguration(10500n<<32n).liquidationBonusBps,10500);assert.equal(decodeConfiguration(8000n<<16n).liquidationThresholdBps,8000);console.log(JSON.stringify({build:'12.9.74',unitAssertionsPassed:2}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}else main(process.env.BASE_RPC_URL).catch(e=>{console.error('LIQUIDATION_PROFIT_12974_FAILED',fail(e));process.exitCode=1})}
module.exports={main,decodeConfiguration};
