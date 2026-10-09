'use strict';
// Build 12.9.39: discover 20-30+ distinct active onchain pools, NOT route permutations.
// Confirmed block pool identity + liquidity; pending state is an independent diagnostic.
// Read-only and NEVER production execution permission.
const assert=require('node:assert/strict'),{ethers}=require('ethers');
const TOKENS={
 USDC:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
 WETH:'0x4200000000000000000000000000000000000006',
 DAI:'0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
 USDbC:'0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
 cbBTC:'0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
 AERO:'0x940181a94A35A4569E4529A3CDfB74e38FD98631',
 cbETH:'0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
 USDT:'0xfde4c96c8593536e31f229ea8f37b2ada2699bb2',
 WBTC:'0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
 VIRTUAL:'0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
 MORPHO:'0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
 VVV:'0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf',
 BRETT:'0x532f27101965dd16442E59d40670FaF5eBB142E4'
};
const UNI_F='0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
const PAN_F='0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const AERO_F='0x420DD381b31aEf6683db6B902084cB0FFECe40Da';
const UNI_FEES=[100,500,3000,10000],PAN_FEES=[100,500,2500,10000];
const pairs=Object.entries(TOKENS).flatMap(([a,av],i,all)=>all.slice(i+1).map(([b,bv])=>({pair:a+'/'+b,tokenA:av,tokenB:bv})));
const F_V3=['function getPool(address,address,uint24) view returns(address)'];
const F_AERO=['function getPool(address,address,bool) view returns(address)','function isPool(address) view returns(bool)'];
const V3=['function token0() view returns(address)','function token1() view returns(address)','function liquidity() view returns(uint128)','function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)','function fee() view returns(uint24)'];
const V1=['function token0() view returns(address)','function token1() view returns(address)','function getReserves() view returns(uint256,uint256,uint256)'];
async function discover(rpc){
 assert(/^https:\/\//.test(rpc||''),'BASE_RPC_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpc,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n,'WRONG_CHAIN');
  const block=await p.getBlockNumber(),all=[],seen=new Set();
  const checks=[{dex:'UNISWAP_V3',address:UNI_F,fees:UNI_FEES,kind:'v3'},{dex:'PANCAKESWAP_V3',address:PAN_F,fees:PAN_FEES,kind:'v3'},{dex:'AERODROME_V1',address:AERO_F,fees:[false,true],kind:'v1'}];
  for(const c of checks){
   assert((await p.getCode(c.address,block))!=='0x','FACTORY_NOT_DEPLOYED_'+c.dex);
   const fac=new ethers.Contract(c.address,c.kind==='v1'?F_AERO:F_V3,p);
   for(const t of pairs)for(const fee of c.fees){
    let addr;
    try{addr=await fac.getPool(t.tokenA,t.tokenB,fee,{blockTag:block})}catch{continue}
    if(addr===ethers.ZeroAddress||seen.has(addr.toLowerCase()))continue;
    if(await p.getCode(addr,block)==='0x')continue;
    try{
     const pool=new ethers.Contract(addr,c.kind==='v1'?V1:V3,p);
     const [a,b]=await Promise.all([pool.token0({blockTag:block}),pool.token1({blockTag:block})]);
     const expected=new Set([t.tokenA.toLowerCase(),t.tokenB.toLowerCase()]);
     if(!expected.has(a.toLowerCase())||!expected.has(b.toLowerCase())||a.toLowerCase()===b.toLowerCase())continue;
     let active=false,liquidityRaw,priceStateRaw=null;
     if(c.kind==='v1'){
      if(!await fac.isPool(addr,{blockTag:block}))continue;
      const reserves=await pool.getReserves({blockTag:block});
      active=BigInt(reserves[0])>0n&&BigInt(reserves[1])>0n;
      liquidityRaw=[reserves[0].toString(),reserves[1].toString()];
     }else{
      const [liq,slot,onFee]=await Promise.all([pool.liquidity({blockTag:block}),pool.slot0({blockTag:block}),pool.fee({blockTag:block})]);
      if(Number(onFee)!==fee)continue;
      active=liq>0n&&slot[0]>0n;liquidityRaw=liq.toString();priceStateRaw=slot[0].toString();
     }
     if(!active)continue;
     seen.add(addr.toLowerCase());
     all.push({dex:c.dex,pair:t.pair,address:addr,poolConfig:fee,kind:c.kind,liquidityRaw,priceStateRaw,confirmedBlock:block,verifiedOnchain:true,pendingQuoteVerified:false,tradeSizeQuoteVerified:false,qualified:false});
    }catch{}
   }
  }
  const min=20,target=30;
  const status=all.length>=target?'TARGET_30_REACHED':all.length>=min?'MINIMUM_20_REACHED':'BELOW_MINIMUM_20';
  return {success:all.length>=min,build:'12.9.39',mode:'ONCHAIN_DISTINCT_ACTIVE_POOL_DISCOVERY',confirmedBlock:block,tokenCount:Object.keys(TOKENS).length,pairsSearched:pairs.length,uniqueActivePools:all.length,minimumDistinctActivePools:min,targetDistinctActivePools:target,status,pools:all,readOnly:true,mainnetBroadcast:false,executionEligible:false,qualified:0,alerts:[]};
 }finally{p.destroy()}
}
if(require.main===module){
 assert.equal(pairs.length,78);
 assert.equal(new Set(Object.values(TOKENS).map(x=>x.toLowerCase())).size,Object.keys(TOKENS).length);
 console.log(JSON.stringify({build:'12.9.39',unitAssertionsPassed:2,liveDiscoveryRun:!!process.env.BASE_RPC_URL,qualified:0,alerts:[]}));
 if(process.env.BASE_RPC_URL)discover(process.env.BASE_RPC_URL).then(x=>{console.log(JSON.stringify(x));if(!x.success)process.exitCode=1}).catch(e=>{console.error('POOL_12939_FAILED',String(e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,220));process.exitCode=1});
}
module.exports={discover,TOKENS,pairs};
