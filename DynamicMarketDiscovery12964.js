'use strict';
// ArbiFlow 12.9.64: dynamic Uniswap V3-compatible factory event discovery on Base.
// No token whitelist, no USDC anchor, no trade execution. Incremental bounded RPC pages.
const fs=require('node:fs');
const {ethers}=require('ethers');
const FACTORIES={
 UNISWAP_V3:'0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
 PANCAKESWAP_V3:'0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865'
};
const iface=new ethers.Interface(['event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)']);
const topic=iface.getEvent('PoolCreated').topicHash;
function decode(log,dex){
 const p=iface.parseLog(log);
 if(!p||p.name!=='PoolCreated')throw Error('INVALID_EVENT');
 return {dex,kind:'v3',token0:p.args.token0,token1:p.args.token1,fee:Number(p.args.fee),pool:p.args.pool,createdBlock:log.blockNumber,txHash:log.transactionHash};
}
async function scan(rpc,{fromBlock,toBlock,chunkSize=500}={}){
 if(!/^https:\/\//.test(rpc||''))throw Error('BASE_RPC_URL_REQUIRED');
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  if(BigInt(await provider.send('eth_chainId',[]))!==8453n)throw Error('WRONG_CHAIN');
  const head=await provider.getBlockNumber();
  const from=Number(fromBlock??Math.max(0,head-999));
  const to=Number(toBlock??head);
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<from||to>head)throw Error('INVALID_BLOCK_RANGE');
  if(!Number.isSafeInteger(chunkSize)||chunkSize<1||chunkSize>2000)throw Error('INVALID_CHUNK_SIZE');
  const pools=[],errors=[],seen=new Set(),tokens=new Set(),pages=[];
  for(let start=from;start<=to;start+=chunkSize){
   const end=Math.min(to,start+chunkSize-1);
   for(const [dex,address] of Object.entries(FACTORIES)){
    try{
     const logs=await provider.getLogs({address,topics:[topic],fromBlock:start,toBlock:end});
     pages.push({dex,fromBlock:start,toBlock:end,events:logs.length});
     for(const log of logs){
      const pool=decode(log,dex);
      if(seen.has(pool.pool.toLowerCase()))continue;
      seen.add(pool.pool.toLowerCase());tokens.add(pool.token0.toLowerCase());tokens.add(pool.token1.toLowerCase());pools.push(pool);
     }
    }catch(e){
     errors.push({dex,fromBlock:start,toBlock:end,reason:String(e?.shortMessage||e?.message||e).slice(0,140)});
    }
   }
  }
  const report={build:'12.9.64',mode:'DYNAMIC_FACTORY_EVENT_MARKET_DISCOVERY',network:'BASE',chainId:8453,headBlock:head,fromBlock:from,toBlock:to,chunkSize,venues:Object.keys(FACTORIES),uniqueTokens:tokens.size,uniquePools:pools.length,pagesScanned:pages.length,failedPages:errors.length,coverageComplete:errors.length===0,eventsOnly:true,liquidityVerified:false,quotesExecuted:false,pools,errors,pages,readOnly:true,mainnetBroadcast:false,executionEligible:false};
  fs.writeFileSync('arbiflow-dynamic-discovery-12964.json',JSON.stringify(report,null,2)+'\n');
  return {...report,pools:undefined,pages:undefined};
 }finally{provider.destroy()}
}
if(require.main===module){
 const fake=iface.encodeEventLog(iface.getEvent('PoolCreated'),['0x0000000000000000000000000000000000000001','0x0000000000000000000000000000000000000002',500,10,'0x0000000000000000000000000000000000000003']);
 const decoded=decode({topics:fake.topics,data:fake.data,blockNumber:123,transactionHash:'0xabc'},'UNISWAP_V3');
 if(decoded.fee!==500||decoded.pool.toLowerCase()!=='0x0000000000000000000000000000000000000003')throw Error('DECODE_TEST_FAILED');
 console.log(JSON.stringify({build:'12.9.64',eventDecodeUnitTest:'PASS',readOnly:true}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else scan(process.env.BASE_RPC_URL,{fromBlock:process.env.FROM_BLOCK?Number(process.env.FROM_BLOCK):undefined,toBlock:process.env.TO_BLOCK?Number(process.env.TO_BLOCK):undefined,chunkSize:Number(process.env.CHUNK_SIZE||500)}).then(r=>{console.log(JSON.stringify(r));if(!r.coverageComplete)process.exitCode=2}).catch(e=>{console.error('DISCOVERY_FAILED',String(e?.message||e).slice(0,160));process.exitCode=1});
}
module.exports={scan,decode,FACTORIES};
