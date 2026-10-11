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
function diagnostic(e){
 const data=e?.info?.error||e?.error||{};
 const message=String(data.message||e?.shortMessage||e?.message||e).replace(/https?:\/\/[^\s"']+/g,'[RPC_URL]').slice(0,240);
 return {code:data.code??e?.code??null,message};
}
async function getLogsAdaptive(provider,address,start,end,metrics,depth=0,topics=[topic]){
 try{
  metrics.attempts++;
  return await provider.getLogs({address,topics,fromBlock:start,toBlock:end});
 }catch(e){
  metrics.failures++;
  if(start===end||depth>=14){
   const err=new Error('LOG_QUERY_FAILED');
   err.diagnostic=diagnostic(e);
   throw err;
  }
  metrics.splits++;
  const middle=Math.floor((start+end)/2);
  const left=await getLogsAdaptive(provider,address,start,middle,metrics,depth+1,topics);
  const right=await getLogsAdaptive(provider,address,middle+1,end,metrics,depth+1,topics);
  return [...left,...right];
 }
}
const INVENTORY_PATH='arbiflow-market-inventory-12967.json';
function loadInventory(){
 if(!fs.existsSync(INVENTORY_PATH))return {chainId:8453,lastCompleteBlock:null,pools:[]};
 const obj=JSON.parse(fs.readFileSync(INVENTORY_PATH,'utf8'));
 if(obj.chainId!==8453||!Array.isArray(obj.pools))throw Error('INVALID_INVENTORY');
 return obj;
}
async function scan(rpc,{fromBlock,toBlock,chunkSize=8,backfillBlocks=0}={}){
 if(!/^https:\/\//.test(rpc||''))throw Error('BASE_RPC_URL_REQUIRED');
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  if(BigInt(await provider.send('eth_chainId',[]))!==8453n)throw Error('WRONG_CHAIN');
  const head=await provider.getBlockNumber();
  const inventory=loadInventory();
  const backfill=Number(backfillBlocks)>0;
  if(backfill&&!Number.isSafeInteger(Number(backfillBlocks)))throw Error('INVALID_BACKFILL_BLOCKS');
  const seed=inventory.backfillCursor??Math.min(...inventory.pools.map(p=>p.createdBlock).filter(Number.isSafeInteger),inventory.lastCompleteBlock??head);
  const to=Number(toBlock??(backfill?seed-1:head));
  const from=Number(fromBlock??(backfill?Math.max(0,to-Number(backfillBlocks)+1):(inventory.lastCompleteBlock===null?Math.max(0,head-999):inventory.lastCompleteBlock+1)));
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to>head)throw Error('INVALID_BLOCK_RANGE');
  if(from>to)return {build:'12.9.67',mode:'INCREMENTAL_MARKET_INVENTORY',status:'ALREADY_CURRENT',lastCompleteBlock:inventory.lastCompleteBlock,inventoryPools:inventory.pools.length,readOnly:true};
  if(!Number.isSafeInteger(chunkSize)||chunkSize<1||chunkSize>2000)throw Error('INVALID_CHUNK_SIZE');
  const pools=[],errors=[],seen=new Set(inventory.pools.map(p=>p.pool.toLowerCase())),tokens=new Set(),pages=[],rpcMetrics={attempts:0,failures:0,splits:0};
  const diagnostics=[];
  for(const [dex,address] of Object.entries(FACTORIES)){
   const code=await provider.getCode(address,to);
   const row={dex,factory:address,contractExists:code!=='0x',eventTopic:topic,probeBlock:to,allFactoryLogs:0,matchingPoolCreatedLogs:0,probeError:null};
   try{
    const raw=await getLogsAdaptive(provider,address,to,to,rpcMetrics,0,[]);
    row.allFactoryLogs=raw.length;
    row.matchingPoolCreatedLogs=raw.filter(log=>log.topics[0]?.toLowerCase()===topic.toLowerCase()).length;
    row.observedTopics=[...new Set(raw.map(log=>log.topics[0]))].slice(0,12);
   }catch(e){row.probeError=e?.diagnostic||diagnostic(e)}
   diagnostics.push(row);
  }
  let lastCompleteBlock=from-1;
  let backfillCursor=inventory.backfillCursor??null;
  for(let start=from;start<=to;start+=chunkSize){
   const end=Math.min(to,start+chunkSize-1);
   let pageFailed=false;
   for(const [dex,address] of Object.entries(FACTORIES)){
    try{
     const logs=await getLogsAdaptive(provider,address,start,end,rpcMetrics);
     pages.push({dex,fromBlock:start,toBlock:end,events:logs.length});
     for(const log of logs){
      const pool=decode(log,dex);
      if(seen.has(pool.pool.toLowerCase()))continue;
      seen.add(pool.pool.toLowerCase());tokens.add(pool.token0.toLowerCase());tokens.add(pool.token1.toLowerCase());pools.push(pool);
     }
    }catch(e){
     pageFailed=true;
     errors.push({dex,fromBlock:start,toBlock:end,reason:e?.diagnostic||diagnostic(e)});
    }
   }
   if(pageFailed)break;
   lastCompleteBlock=end;
  }
  if(backfill&&lastCompleteBlock===to)backfillCursor=from;
  const merged=[...inventory.pools,...pools];
  if(lastCompleteBlock>=from){
   const forwardCursor=backfill?inventory.lastCompleteBlock:lastCompleteBlock;
   fs.writeFileSync(INVENTORY_PATH,JSON.stringify({chainId:8453,lastCompleteBlock:forwardCursor,backfillCursor,pools:merged},null,2)+'\n');
  }
  const report={build:'12.9.70',mode:backfill?'HISTORICAL_BACKFILL':'INCREMENTAL_MARKET_INVENTORY',backfillCursor,network:'BASE',chainId:8453,headBlock:head,fromBlock:from,toBlock:to,chunkSize,venues:Object.keys(FACTORIES),uniqueTokens:tokens.size,uniquePools:pools.length,inventoryPools:merged.length,lastCompleteBlock,pagesScanned:pages.length,failedPages:errors.length,rpcMetrics,diagnostics,coverageComplete:errors.length===0&&lastCompleteBlock===to&&diagnostics.every(d=>d.contractExists&&!d.probeError),eventsOnly:true,liquidityVerified:false,quotesExecuted:false,pools,errors,pages,readOnly:true,mainnetBroadcast:false,executionEligible:false};
  fs.writeFileSync('arbiflow-dynamic-discovery-12964.json',JSON.stringify(report,null,2)+'\n');
  return {...report,pools:undefined,pages:undefined};
 }finally{provider.destroy()}
}
if(require.main===module){
 const fake=iface.encodeEventLog(iface.getEvent('PoolCreated'),['0x0000000000000000000000000000000000000001','0x0000000000000000000000000000000000000002',500,10,'0x0000000000000000000000000000000000000003']);
 const decoded=decode({topics:fake.topics,data:fake.data,blockNumber:123,transactionHash:'0xabc'},'UNISWAP_V3');
 if(decoded.fee!==500||decoded.pool.toLowerCase()!=='0x0000000000000000000000000000000000000003')throw Error('DECODE_TEST_FAILED');
 console.log(JSON.stringify({build:'12.9.70',eventDecodeUnitTest:'PASS',readOnly:true}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else scan(process.env.BASE_RPC_URL,{fromBlock:process.env.FROM_BLOCK?Number(process.env.FROM_BLOCK):undefined,toBlock:process.env.TO_BLOCK?Number(process.env.TO_BLOCK):undefined,chunkSize:Number(process.env.CHUNK_SIZE||8),backfillBlocks:Number(process.env.BACKFILL_BLOCKS||0)}).then(r=>{console.log(JSON.stringify(r));if(!r.coverageComplete)process.exitCode=2}).catch(e=>{console.error('DISCOVERY_FAILED',String(e?.message||e).slice(0,160));process.exitCode=1});
}
module.exports={scan,decode,FACTORIES};
