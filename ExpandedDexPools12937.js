'use strict';
// Build 12.9.37: genuine Base factory queries, read-only. Do not interpret pools as executable quotes.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',WETH='0x4200000000000000000000000000000000000006';
const AERO_FACTORY='0x420DD381b31aEf6683db6B902084cB0FFECe40Da';
const PANCAKE_FACTORY='0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const PANCAKE_FEES=[100,500,2500,10000];
const MIN_LOAN_USDC=10000,MAX_LOAN_USDC=1000000;
const ABI_AERO=['function getPool(address,address,bool) view returns(address)','function isPool(address) view returns(bool)','function getFee(address,bool) view returns(uint256)'];
const ABI_PANCAKE=['function getPool(address,address,uint24) view returns(address)'];
const POOL_AERO=['function token0() view returns(address)','function token1() view returns(address)','function getReserves() view returns(uint256,uint256,uint256)'];
const POOL_PANCAKE=['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)','function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)'];
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n,'WRONG_CHAIN');
  const block=await p.getBlockNumber();
  for(const addr of [AERO_FACTORY,PANCAKE_FACTORY])assert((await p.getCode(addr,block))!=='0x','FACTORY_CODE_MISSING:'+addr);
  const aero=new ethers.Contract(AERO_FACTORY,ABI_AERO,p),cake=new ethers.Contract(PANCAKE_FACTORY,ABI_PANCAKE,p);
  const results=[];
  const validTokens=(t0,t1)=>new Set([t0.toLowerCase(),t1.toLowerCase()]).size===2&&[USDC,WETH].every(t=>new Set([t0.toLowerCase(),t1.toLowerCase()]).has(t.toLowerCase()));
  for(const stable of [false,true]){
   const row={dex:'AERODROME_V1',poolType:stable?'STABLE':'VOLATILE',poolAddress:null,exists:false,activeLiquidityObserved:false,feeRaw:null,qualified:false,executionEnabled:false,blockedReasons:[]};
   try{
    const addr=await aero.getPool(USDC,WETH,stable,{blockTag:block});
    if(addr===ethers.ZeroAddress){row.blockedReasons.push('NO_POOL');results.push(row);continue;}
    if(await p.getCode(addr,block)==='0x'||!await aero.isPool(addr,{blockTag:block}))throw Error('POOL_NOT_FACTORY_RECOGNIZED');
    const pair=new ethers.Contract(addr,POOL_AERO,p);
    const [a,b,res,fee]=await Promise.all([pair.token0({blockTag:block}),pair.token1({blockTag:block}),pair.getReserves({blockTag:block}),aero.getFee(addr,stable,{blockTag:block})]);
    assert(validTokens(a,b),'TOKEN_MISMATCH');
    row.poolAddress=addr;row.exists=true;row.reservesRaw=[res[0].toString(),res[1].toString()];row.activeLiquidityObserved=BigInt(res[0])>0n&&BigInt(res[1])>0n;row.feeRaw=fee.toString();
    if(!row.activeLiquidityObserved)row.blockedReasons.push('EMPTY_RESERVES');
   }catch(err){row.blockedReasons.push('POOL_VERIFICATION_FAILED');row.error=String(err?.shortMessage||err?.message||err).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,95)}
   row.blockedReasons.push('TRADE_SIZE_QUOTES_AND_REPAYMENT_NOT_VERIFIED');results.push(row);
  }
  for(const fee of PANCAKE_FEES){
   const row={dex:'PANCAKESWAP_V3',feeTier:fee,poolAddress:null,exists:false,activeLiquidityObserved:false,qualified:false,executionEnabled:false,blockedReasons:[]};
   try{
    const addr=await cake.getPool(USDC,WETH,fee,{blockTag:block});
    if(addr===ethers.ZeroAddress){row.blockedReasons.push('NO_POOL');results.push(row);continue;}
    if(await p.getCode(addr,block)==='0x')throw Error('MISSING_POOL_CODE');
    const pair=new ethers.Contract(addr,POOL_PANCAKE,p);
    const [a,b,actualFee,liq,slot]=await Promise.all([pair.token0({blockTag:block}),pair.token1({blockTag:block}),pair.fee({blockTag:block}),pair.liquidity({blockTag:block}),pair.slot0({blockTag:block})]);
    assert(validTokens(a,b)&&Number(actualFee)===fee,'POOL_IDENTITY_MISMATCH');
    row.exists=true;row.poolAddress=addr;row.activeLiquidityRaw=liq.toString();row.sqrtPriceX96=slot[0].toString();row.activeLiquidityObserved=liq>0n&&slot[0]>0n;
    if(!row.activeLiquidityObserved)row.blockedReasons.push('NO_ACTIVE_LIQUIDITY');
   }catch(err){row.blockedReasons.push('POOL_VERIFICATION_FAILED');row.error=String(err?.shortMessage||err?.message||err).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,95)}
   row.blockedReasons.push('TRADE_SIZE_QUOTES_AND_REPAYMENT_NOT_VERIFIED');results.push(row);
  }
  return {success:true,build:'12.9.37',mode:'BASE_FACTORY_VERIFIED_DEX_POOL_DISCOVERY',blockNumber:block,minimumLoanUsdc:MIN_LOAN_USDC,maximumLoanUsdc:MAX_LOAN_USDC,factories:[AERO_FACTORY,PANCAKE_FACTORY],pools:results,activePools:results.filter(x=>x.activeLiquidityObserved).length,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false};
 }finally{p.destroy()}
}
if(require.main===module){
 assert.equal(MIN_LOAN_USDC,10000);assert.equal(PANCAKE_FEES.length,4);
 console.log(JSON.stringify({success:true,build:'12.9.37',unitAssertionsPassed:2,realPoolDiscovery:!!process.env.BASE_RPC_URL,qualified:0,alerts:[]}));
 if(process.env.BASE_RPC_URL)run(process.env.BASE_RPC_URL).then(x=>{console.log(JSON.stringify(x));if(!x.pools.some(v=>v.exists))process.exitCode=1}).catch(e=>{console.error('DEX_POOL_12937_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,180));process.exitCode=1});
}
module.exports={run,PANCAKE_FEES};
