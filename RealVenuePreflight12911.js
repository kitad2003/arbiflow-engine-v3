'use strict';
// Real venues, fork-backed READ-ONLY integration preflight.
// Proves pool contracts and quote inputs; never submits swaps or flash loans.
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const RPC=process.env.BASE_RPC_URL;
const USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const WETH='0x4200000000000000000000000000000000000006';
const POOLS=[
 {venue:'UNISWAP_V3',address:'0xd0b53d9277642d899df5c87a3966a349a798f224',expectedFee:500n},
 {venue:'AERODROME_SLIPSTREAM',address:'0xb2cc224c1c9fee385f8ad6a55b4d94e92359dc59',expectedFee:100n}
];
const abi=['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)'];
async function main(){
 if(!/^https:\/\//.test(RPC||''))throw Error('BASE_RPC_URL_HTTPS_REQUIRED');
 const p=new ethers.JsonRpcProvider(RPC,8453,{staticNetwork:true});
 assert.equal(BigInt(await p.send('eth_chainId',[])),8453n);
 const block=await p.getBlockNumber();
 const results=[];
 for(const row of POOLS){
  const code=await p.getCode(row.address);assert.notEqual(code,'0x',row.venue+'_POOL_MISSING');
  const pool=new ethers.Contract(row.address,abi,p);
  const [a,b,fee]=await Promise.all([pool.token0(),pool.token1(),pool.fee()]);
  assert.deepEqual([a.toLowerCase(),b.toLowerCase()].sort(),[USDC,WETH].sort(),row.venue+'_WRONG_PAIR actual='+a+','+b);
  assert.equal(fee,row.expectedFee,row.venue+'_WRONG_FEE_TIER actual='+fee.toString()+' expected='+row.expectedFee.toString());
  results.push({venue:row.venue,pool:row.address,feeTier:Number(fee),pairVerified:true});
 }
 console.log(JSON.stringify({success:true,build:'12.9.11',mode:'DIRECT_RPC_REAL_POOL_PREFLIGHT',block,pools:results,realVenuePoolReadsVerified:true,swapExecutionTested:false,flashLoanExecuted:false,atomicRoundTripVerified:false,gasUnitsMeasured:null,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false}));
 p.destroy();
}
main().catch(e=>{console.error('VENUE_PREFLIGHT_FAILED',String(e?.message||e?.shortMessage||e?.code||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,220));process.exitCode=1});
