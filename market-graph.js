'use strict';
// Read-only multi-token graph discovery; no trades or alerts.
module.exports.mount=(app,{getChain,call})=>{
 const {Interface}=require('ethers');
 const abi=new Interface(['function getPool(address,address,uint24) view returns (address)','function getPair(address,address) view returns (address)','function token0() view returns (address)','function token1() view returns (address)','function liquidity() view returns (uint128)','function getReserves() view returns (uint112,uint112,uint32)']);
 const dai={8453:'0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',42161:'0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',10:'0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'};
 const factories={8453:['0x33128a8fC17869897dcE68Ed026d694621f6FDfD','0x71524B4f93c58fcbF659783284E38825f0622859'],42161:['0x1F98431c8aD98523631AE4a59f267346ea31F984','0xc35DADB65012eC5796536bD9864eD8773aBc74C4'],10:['0x1F98431c8aD98523631AE4a59f267346ea31F984','0xFbc12984689e5f15626Bad03Ad60160Fe98B303C']};
 const state={running:false,runs:0,lastCompletedAt:null,result:null};
 const valid=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{40}$/.test(x)&&!/^0x0{40}$/i.test(x);
 const pairs=[['USDC','WETH'],['USDC','DAI'],['WETH','DAI']];
 async function run(chainId){
  const chain=getChain(chainId),f=factories[chainId];if(!chain||!f)throw Error('UNSUPPORTED_CHAIN');
  const tokens={USDC:chain.tokens.USDC,WETH:chain.tokens.WETH,DAI:dai[chainId]};
  const venues=[{name:'UNISWAP_V3_500',factory:f[0],fee:500},{name:'UNISWAP_V3_3000',factory:f[0],fee:3000},{name:'SUSHISWAP_V2',factory:f[1]}];
  const edges=[];
  for(const [a,b] of pairs)for(const v of venues){
   const row={pair:a+'/'+b,venue:v.name,status:'UNTESTED',pool:null};
   try{
    const fn=v.fee?'getPool':'getPair';
    const args=v.fee?[tokens[a].toLowerCase(),tokens[b].toLowerCase(),v.fee]:[tokens[a].toLowerCase(),tokens[b].toLowerCase()];
    const raw=await call(chain,v.factory,abi.encodeFunctionData(fn,args));
    const pool=abi.decodeFunctionResult(fn,raw)[0];
    if(!valid(pool)){row.status='NO_POOL';edges.push(row);continue;}
    row.pool=pool;
    const addresses=[];
    for(const method of ['token0','token1'])addresses.push(String(abi.decodeFunctionResult(method,await call(chain,pool,abi.encodeFunctionData(method,[])))[0]).toLowerCase());
    if(!addresses.includes(tokens[a].toLowerCase())||!addresses.includes(tokens[b].toLowerCase())){row.status='TOKEN_MISMATCH';edges.push(row);continue;}
    if(v.fee){const l=abi.decodeFunctionResult('liquidity',await call(chain,pool,abi.encodeFunctionData('liquidity',[])))[0];row.status=l>0n?'POOL_LIVE':'POOL_EMPTY';row.activeLiquidity=l.toString();}
    else{const r=abi.decodeFunctionResult('getReserves',await call(chain,pool,abi.encodeFunctionData('getReserves',[])));row.status=r[0]>0n&&r[1]>0n?'POOL_LIVE':'POOL_EMPTY';row.reserves=[r[0].toString(),r[1].toString()];}
   }catch(e){row.status='ERROR';row.error=String(e.message||e).slice(0,150);}
   edges.push(row);
   if(row.error&&/429|COOLDOWN|RATE_LIMIT/.test(row.error))break;
  }
  const live=edges.filter(x=>x.status==='POOL_LIVE');
  const byPair=Object.fromEntries(pairs.map(([a,b])=>[a+'/'+b,live.filter(x=>x.pair===a+'/'+b).length]));
  return {success:true,stage:'MULTI_TOKEN_MARKET_GRAPH_DISCOVERY',chainId,tokens:Object.keys(tokens),poolChecks:edges.length,livePools:live.length,byPair,triangularTopologyAvailable:Object.values(byPair).every(n=>n>0),triangularCyclesQuoted:0,qualified:0,alertsEmitted:0,edges,limitations:['TOPOLOGY_ONLY_NOT_EXECUTABLE_QUOTES','NO_DYNAMIC_SIZING','NO_GAS_OR_LOAN_COST','NO_ATOMIC_SIMULATION'],safety:{readOnly:true,mainnetBroadcast:false,executionEligible:false}};
 }
 app.get('/api/market-graph/status',(_req,res)=>res.json({success:true,...state,safety:{readOnly:true,mainnetBroadcast:false}}));
 app.get('/api/market-graph/run',(req,res)=>{
  if(state.running)return res.status(409).json({success:false,error:'GRAPH_SCAN_RUNNING'});
  const chainId=Number(req.query.chainId||8453);
  if(!factories[chainId])return res.status(400).json({success:false,error:'SUPPORTED_CHAIN_IDS_8453_42161_10'});
  state.running=true;state.runs++;
  setImmediate(async()=>{try{state.result=await run(chainId);}catch(e){state.result={success:false,error:String(e.message||e).slice(0,200)};}finally{state.running=false;state.lastCompletedAt=new Date().toISOString();}});
  res.json({success:true,status:'STARTED_BACKGROUND',statusRoute:'/api/market-graph/status',readOnly:true});
 });
};
