'use strict';
// Read-only Base flash-capital provider audit. No flash-loan requests or transactions.
const fs=require('node:fs'),assert=require('node:assert/strict'),{ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const VAULT2='0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const VAULT3='0xbA1333333333a1BA1108E8412f11850A5C319bA9';
const ERC20=['function balanceOf(address) view returns(uint256)'];
const POOL=['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)'];
const PRINCIPAL=10000n*1000000n;
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');
 const d=await discover(rpc);assert(d.success,'DISCOVERY_FAILED');const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n);
  const block=d.confirmedBlock,usdc=new ethers.Contract(TOKENS.USDC,ERC20,p),results=[];
  for(const item of [{name:'Balancer V2 Vault',kind:'BALANCER_V2',address:VAULT2},{name:'Balancer V3 Vault',kind:'BALANCER_V3_UNLOCK_SETTLE',address:VAULT3}]){
   const x={...item,flashMechanism:item.kind==='BALANCER_V2'?'vault.flashLoan / receiveFlashLoan':'unlock / sendTo / settle (requires contract integration)',loanRequested:false,feeVerified:false};
   try{const code=await p.getCode(item.address,block);x.deployed=code!=='0x';if(x.deployed){const bal=BigInt(await usdc.balanceOf(item.address,{blockTag:block}));x.usdcBalanceRaw=bal.toString();x.usdcBalance=Number(bal)/1e6;x.hasAtLeast10kBalance=bal>=PRINCIPAL;x.status='BALANCE_ONLY_NOT_LOAN_VERIFIED'}else x.status='NO_CODE'}catch(e){x.status='READ_FAILED';x.error=String(e?.shortMessage||e?.message||e).slice(0,90)}results.push(x)
  }
  const uni=d.pools.filter(x=>x.dex==='UNISWAP_V3'&&x.pair==='USDC/WETH');
  for(const item of uni){const x={name:'Uniswap V3 pool',kind:'UNISWAP_V3_POOL_FLASH',address:item.address,feeTier:item.poolConfig,loanRequested:false,feeVerified:false};
   try{const code=await p.getCode(item.address,block);x.deployed=code!=='0x';if(!x.deployed){x.status='NO_CODE';results.push(x);continue}
    const c=new ethers.Contract(item.address,POOL,p),[a,b,f,liq,bal]=await Promise.all([c.token0({blockTag:block}),c.token1({blockTag:block}),c.fee({blockTag:block}),c.liquidity({blockTag:block}),usdc.balanceOf(item.address,{blockTag:block})]);
    x.poolTokens=[a,b];x.feeTierOnchain=Number(f);x.liquidityRaw=liq.toString();x.usdcBalanceRaw=bal.toString();x.usdcBalance=Number(bal)/1e6;x.hasAtLeast10kBalance=bal>=PRINCIPAL;x.status='BALANCE_ONLY_NOT_LOAN_VERIFIED';
   }catch(e){x.status='READ_FAILED';x.error=String(e?.shortMessage||e?.message||e).slice(0,90)}results.push(x)
  }
  const report={build:'FLASH_PROVIDER_READINESS_1',chain:'BASE',chainId:8453,block,requestedPrincipalUsdc:10000,results,comparison:{aave:'CURRENT_BASELINE',balancerV2:'EVALUATE_FLASHLOAN_CALLBACK_ON_FORK',balancerV3:'EVALUATE_UNLOCK_SETTLEMENT_ON_FORK',uniswapV3:'EVALUATE_FLASH_CALLBACK_AND_FEE_ON_FORK'},qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false,warnings:['TOKEN_BALANCE_DOES_NOT_PROVE_FLASH_LOAN_ELIGIBILITY','UNISWAP_FLASH_FEES_AND_CALLBACK_NOT_VERIFIED','BALANCER_V2_FEES_AND_CALLBACK_NOT_VERIFIED','BALANCER_V3_UNLOCK_SETTLEMENT_NOT_VERIFIED','NO_REAL_LOANS_REQUESTED']};
  fs.writeFileSync('arbiflow-provider-readiness.json',JSON.stringify(report,null,2)+'\n');return report
 }finally{p.destroy()}
}
if(require.main===module){assert.equal(PRINCIPAL,10000000000n);console.log(JSON.stringify({build:'FLASH_PROVIDER_READINESS_1',unitAssertionsPassed:1}));if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}else run(process.env.BASE_RPC_URL).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error('PROVIDER_AUDIT_FAILED',String(e.message).slice(0,120));process.exitCode=1})}
module.exports={run};
