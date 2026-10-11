'use strict';
// 12.9.58: verify that each recorded V3 pool is the actual factory-selected pool
// for the exact token pair and fee tier used by the quoter. Read-only.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {discover,TOKENS}=require('./PoolUniverse12939');
const FACTORIES={UNISWAP_V3:'0x33128a8fC17869897dcE68Ed026d694621f6FDfD',PANCAKESWAP_V3:'0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865'};
const F=['function getPool(address,address,uint24) view returns(address)'];
const V=['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)'];
const norm=a=>String(a).toLowerCase();
function checkPool(pool,returned,token0,token1,fee){
 const [a,b]=pool.pair.split('/');
 const expected=[norm(TOKENS[a]),norm(TOKENS[b])].sort();
 const actual=[norm(token0),norm(token1)].sort();
 const issues=[];
 if(norm(returned)!==norm(pool.address))issues.push('FACTORY_POOL_MISMATCH');
 if(expected.join('|')!==actual.join('|'))issues.push('TOKEN_MISMATCH');
 if(Number(fee)!==Number(pool.poolConfig))issues.push('FEE_MISMATCH');
 return issues;
}
async function run(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_URL_REQUIRED');
 const discovery=await discover(rpc);
 assert(discovery.success,'DISCOVERY_FAILED');
 const provider=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  const block=discovery.confirmedBlock,rows=[];
  const factories=Object.fromEntries(Object.entries(FACTORIES).map(([dex,address])=>[dex,new ethers.Contract(address,F,provider)]));
  for(const pool of discovery.pools){
   const row={dex:pool.dex,pair:pool.pair,pool:pool.address,kind:pool.kind,status:'UNVERIFIED',issues:[]};
   if(pool.kind!=='v3'){row.status='NOT_V3';rows.push(row);continue}
   try{
    const [a,b]=pool.pair.split('/');
    const factory=factories[pool.dex];
    if(!factory)throw Error('UNKNOWN_FACTORY');
    const contract=new ethers.Contract(pool.address,V,provider);
    const [selected,token0,token1,fee]=await Promise.all([
     factory.getPool(TOKENS[a],TOKENS[b],Number(pool.poolConfig),{blockTag:block}),
     contract.token0({blockTag:block}),contract.token1({blockTag:block}),contract.fee({blockTag:block})
    ]);
    row.factoryPool=selected;
    row.issues=checkPool(pool,selected,token0,token1,fee);
    row.status=row.issues.length?'MISMATCH':'VERIFIED';
   }catch(e){row.status='RPC_OR_CONTRACT_ERROR';row.issues=[String(e?.shortMessage||e?.message||e).slice(0,140)]}
   rows.push(row);
  }
  const counts={verified:rows.filter(x=>x.status==='VERIFIED').length,mismatch:rows.filter(x=>x.status==='MISMATCH').length,errors:rows.filter(x=>x.status==='RPC_OR_CONTRACT_ERROR').length,nonV3:rows.filter(x=>x.status==='NOT_V3').length};
  const report={build:'12.9.58',mode:'PINNED_BLOCK_FACTORY_POOL_IDENTITY_AUDIT',block,discoveredPools:discovery.uniqueActivePools,counts,problems:rows.filter(x=>x.issues.length),allPools:rows,readOnly:true,mainnetBroadcast:false,executionEligible:false,warning:'FACTORY_IDENTITY_CHECK_DOES_NOT_VALIDATE_QUOTER_EXECUTION_PATH_OR_DISCOVERY_COMPLETENESS'};
  fs.writeFileSync('arbiflow-pool-identity-audit.json',JSON.stringify(report,null,2)+'\n');
  return {...report,allPools:undefined};
 }finally{provider.destroy()}
}
if(require.main===module){
 const pool={pair:'USDC/WETH',address:'0xabc',poolConfig:500};
 assert.deepEqual(checkPool(pool,'0xabc',TOKENS.WETH,TOKENS.USDC,500),[]);
 assert.deepEqual(checkPool(pool,'0xdef',TOKENS.WETH,TOKENS.USDC,500),['FACTORY_POOL_MISMATCH']);
 console.log(JSON.stringify({build:'12.9.58',unitAssertionsPassed:2}));
 if(!process.env.BASE_RPC_URL){console.error('BASE_RPC_URL_REQUIRED');process.exitCode=1}
 else run(process.env.BASE_RPC_URL).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error('IDENTITY_AUDIT_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,160));process.exitCode=1});
}
module.exports={checkPool,run};
