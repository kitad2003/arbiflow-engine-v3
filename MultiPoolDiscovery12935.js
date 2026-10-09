'use strict';
// 12.9.35: pinned-block on-chain Uniswap v3 multi-tier pool discovery.
// Other DEXs stay registry-only until factory mappings are independently verified.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const FACTORY='0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH='0x4200000000000000000000000000000000000006';
const FEES=[100,500,3000,10000];
const LOANS=[10000,25000,50000,100000,250000,500000,1000000];
const ABI=['function getPool(address,address,uint24) view returns(address)'];
const POOL_ABI=['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)','function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)'];
function isSizeAllowed(n){return Number.isSafeInteger(n)&&LOANS.includes(n)}
async function run(rpcUrl){
 assert(/^https:\/\//.test(rpcUrl||''),'BASE_RPC_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpcUrl,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n,'WRONG_CHAIN');
  const block=await p.getBlockNumber();
  assert((await p.getCode(FACTORY,block))!=='0x','UNISWAP_V3_FACTORY_MISSING');
  const f=new ethers.Contract(FACTORY,ABI,p),results=[];
  for(const fee of FEES){
   const row={dex:'UNISWAP_V3',pair:'USDC/WETH',feeBps:fee/100,feeTier:fee,poolAddress:null,exists:false,activeLiquidityRaw:null,priceSqrtX96:null,blockNumber:block,loanSizesUsdc:LOANS,quoteVerified:false,executionEnabled:false,qualified:false,blockedReasons:[]};
   try{
    const addr=await f.getPool(USDC,WETH,fee,{blockTag:block});
    if(addr===ethers.ZeroAddress){row.blockedReasons.push('POOL_DOES_NOT_EXIST');results.push(row);continue;}
    const pool=new ethers.Contract(addr,POOL_ABI,p);
    const [code,t0,t1,onFee,liq,slot]=await Promise.all([p.getCode(addr,block),pool.token0({blockTag:block}),pool.token1({blockTag:block}),pool.fee({blockTag:block}),pool.liquidity({blockTag:block}),pool.slot0({blockTag:block})]);
    assert(code!=='0x'&&new Set([t0.toLowerCase(),t1.toLowerCase()]).has(USDC.toLowerCase())&&new Set([t0.toLowerCase(),t1.toLowerCase()]).has(WETH.toLowerCase())&&Number(onFee)===fee,'POOL_IDENTITY_MISMATCH');
    row.exists=true;row.poolAddress=addr;row.activeLiquidityRaw=liq.toString();row.priceSqrtX96=slot[0].toString();
    if(liq===0n)row.blockedReasons.push('ZERO_ACTIVE_LIQUIDITY');
    if(slot[0]===0n)row.blockedReasons.push('UNINITIALIZED_POOL');
    row.blockedReasons.push('EXACT_SIZE_QUOTES_NOT_YET_VERIFIED','FLASH_LOAN_PREMIUM_GAS_L1_SLIPPAGE_NOT_VERIFIED');
   }catch(err){row.blockedReasons.push('POOL_READ_FAILED');row.error=String(err?.shortMessage||err?.code||err?.message||err).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,100);}
   results.push(row);
  }
  return {success:true,build:'12.9.35',mode:'READ_ONLY_PINNED_BLOCK_MULTI_TIER_POOL_INSPECTION',blockNumber:block,factory:FACTORY,loanSizesUsdc:LOANS,feeTiers:FEES,pools:results,activePools:results.filter(x=>x.exists&&BigInt(x.activeLiquidityRaw||0)>0n).length,qualified:0,alerts:[],mainnetBroadcast:false,executionEligible:false};
 }finally{p.destroy()}
}
if(require.main===module){
 assert.equal(FEES.length,4);assert(isSizeAllowed(10000));assert(isSizeAllowed(1000000));assert(!isSizeAllowed(5000));
 console.log(JSON.stringify({success:true,build:'12.9.35',unitAssertionsPassed:4,qualified:0,alerts:[]}));
 if(process.env.BASE_RPC_URL)run(process.env.BASE_RPC_URL).then(x=>{console.log(JSON.stringify(x));if(x.activePools<1)process.exitCode=1}).catch(e=>{console.error('POOL_DISCOVERY_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,180));process.exitCode=1});
}
module.exports={run,FEES,LOANS};
