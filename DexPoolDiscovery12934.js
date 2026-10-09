'use strict';
// Build 12.9.34: independent read-only Base DEX contract and pool discovery.
// No execution routes are enabled by this registry.
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH='0x4200000000000000000000000000000000000006';
const VENUES=[
 {id:'UNISWAP_V2',type:'V2_FACTORY',address:'0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',source:'UNISWAP_GOVERNANCE'},
 {id:'UNISWAP_V3',type:'EXISTING_ROUTER',address:'0x2626664c2603336E57B271c5C0b26F421741e481',source:'EXISTING_TESTED_BASE_ROUTER'},
 {id:'UNISWAP_V4',type:'V4_POOL_MANAGER',address:'0x498581fF718922c3f8e6A244956aF099B2652b2b',source:'UNISWAP_OFFICIAL_DEPLOYMENTS'},
 {id:'AERODROME_SLIPSTREAM',type:'EXISTING_ROUTER',address:'0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5',source:'EXISTING_TESTED_BASE_ROUTER'},
 {id:'PANCAKESWAP_V3',type:'V3_UNIVERSAL_ROUTER',address:'0xFE6508f0015C778Bdcc1fB5465bA5ebE224C9912',source:'PANCAKESWAP_OFFICIAL_DEPLOYMENTS'},
 {id:'AERODROME_V1',type:'PENDING_FACTORY_VERIFICATION',address:null,source:'PENDING_OFFICIAL_FACTORY_CONFIRMATION'}
];
const PAIRS=[[USDC,WETH]];
function parseMinLoan(v){const n=Number(v);assert(Number.isSafeInteger(n)&&n>=10000&&n<=1000000,'LOAN_MUST_BE_10000_TO_1000000');return n;}
async function discover(rpcUrl){
 assert(/^https:\/\//.test(rpcUrl||''),'BASE_RPC_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpcUrl,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n,'WRONG_CHAIN');
  const block=await p.getBlockNumber();
  const venues=[];
  for(const v of VENUES){
   const row={id:v.id,type:v.type,source:v.source,contractAddress:v.address,contractCodePresent:false,confirmedPools:[],quotingEnabled:false,executionEnabled:false,blockNumber:block,reason:null};
   if(!v.address){row.reason='CONTRACT_NOT_VERIFIED';venues.push(row);continue;}
   const code=await p.getCode(v.address,block);
   row.contractCodePresent=code.length>2;
   if(!row.contractCodePresent){row.reason='NO_CODE_AT_VERIFIED_ADDRESS';venues.push(row);continue;}
   if(v.type==='V2_FACTORY'){
    const factory=new ethers.Contract(v.address,['function getPair(address,address) view returns(address)'],p);
    for(const [a,b] of PAIRS){
     try{
      const pool=await factory.getPair(a,b,{blockTag:block});
      if(pool!==ethers.ZeroAddress&&await p.getCode(pool,block)!=='0x'){
       const pair=new ethers.Contract(pool,['function token0() view returns(address)','function token1() view returns(address)','function getReserves() view returns(uint112,uint112,uint32)'],p);
       const [token0,token1,res]=await Promise.all([pair.token0({blockTag:block}),pair.token1({blockTag:block}),pair.getReserves({blockTag:block})]);
       const valid=new Set([token0.toLowerCase(),token1.toLowerCase()]);
       if(valid.has(a.toLowerCase())&&valid.has(b.toLowerCase())&&BigInt(res[0])>0n&&BigInt(res[1])>0n)
        row.confirmedPools.push({address:pool,pair:'USDC/WETH',reserve0Raw:res[0].toString(),reserve1Raw:res[1].toString(),token0,token1,liquidityObserved:true,executableQuoteVerified:false});
      }
     }catch(e){row.reason='V2_POOL_INSPECTION_FAILED';}
    }
    if(!row.confirmedPools.length&&!row.reason)row.reason='NO_NONZERO_VERIFIED_V2_PAIR';
   }else if(v.type==='V4_POOL_MANAGER')row.reason='V4_POOL_IDS_HOOKS_AND_POOL_STATE_NOT_YET_VERIFIED';
   else row.reason='CONTRACT_EXISTS_POOL_FACTORY_OR_QUOTES_NOT_YET_VERIFIED';
   venues.push(row);
  }
  return {success:true,build:'12.9.34',mode:'BASE_READ_ONLY_DEX_AND_POOL_DISCOVERY',blockNumber:block,minimumLoanUsdc:10000,maximumLoanUsdc:1000000,venues,verifiedCodeContracts:venues.filter(v=>v.contractCodePresent).length,verifiedNonzeroV2Pools:venues.reduce((a,v)=>a+v.confirmedPools.length,0),quoteRoutesCreated:0,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false};
 }finally{p.destroy();}
}
if(require.main===module){
 assert.equal(parseMinLoan(10000),10000);
 assert.throws(()=>parseMinLoan(9999),/LOAN_MUST/);
 assert.equal(VENUES.length,6);
 assert(VENUES.every(v=>v.executionEnabled!==true));
 console.log(JSON.stringify({success:true,build:'12.9.34',unitChecksPassed:4,liveDiscoveryRun:Boolean(process.env.BASE_RPC_URL),venuesConfigured:VENUES.length,qualified:0,alerts:[]}));
 if(process.env.BASE_RPC_URL)discover(process.env.BASE_RPC_URL).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('DISCOVERY_FAILED',String(e?.shortMessage||e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,180));process.exitCode=1});
}
module.exports={discover,VENUES,parseMinLoan};
