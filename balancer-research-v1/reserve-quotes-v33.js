'use strict';
// Flashbots Balancer arbitrage research: confirmed-state Uniswap V2/SushiSwap V2
// reserve quotes are diagnostics, NOT post-target state or executable profit.
const {ethers}=require('ethers');
const {identifyPair,FACTORIES}=require('./verified-pairs-v12');
const WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const MLN='0xec67005c4E498Ec7f55E092bd1d35cbC47C91892';
const PAIRS=[
 {name:'WETH / 0x0F5D2fB2 token',origin:'0x11b1f53204d03e5529f09eb3091939e4fd8c9cf3',alternate:'0x1bEC4db6c3Bc499F3DbF289F5499C30d541FEc97'},
 {name:'WETH / DAI',origin:'0xa478c2975ab1ea89e8196811f51a7b7ade33eb11',alternate:'0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f'}
];
const RESERVES=['function getReserves() view returns(uint112,uint112,uint32)'];
function quote(amount,reserveIn,reserveOut){
 if(amount<=0n||reserveIn<=0n||reserveOut<=0n)return 0n;
 return amount*997n*reserveOut/(reserveIn*1000n+amount*997n);
}
function roundTrip(amount,first,second){
 const intermediate=quote(amount,first.weth,first.other);
 const returned=quote(intermediate,second.other,second.weth);
 return {borrowedWei:amount.toString(),intermediateRaw:intermediate.toString(),
  returnedWei:returned.toString(),grossDifferenceWei:(returned-amount).toString(),
  grossPositive:returned>amount};
}
async function assess({provider,identifyImpl=identifyPair,sizes=[10n**14n,10n**15n,10n**16n]}={}){
 if(!provider)throw Error('ETHEREUM_RPC_REQUIRED');
 if((await provider.getNetwork()).chainId!==1n)throw Error('ETHEREUM_MAINNET_REQUIRED');
 const b=await provider.getBlock('latest');if(!b?.hash)throw Error('CONFIRMED_BLOCK_REQUIRED');
 const results=[];
 for(const pair of PAIRS){
  const identities=await Promise.all([pair.origin,pair.alternate].map(x=>identifyImpl(provider,x,b.number)));
  const [a,z]=identities;
  const good=a.verified&&z.verified&&
   a.venue==='UNISWAP_V2'&&z.venue==='SUSHISWAP_V2'&&
   a.token0.toLowerCase()===z.token0.toLowerCase()&&a.token1.toLowerCase()===z.token1.toLowerCase()&&
   [a.token0.toLowerCase(),a.token1.toLowerCase()].includes(WETH.toLowerCase());
  if(!good){results.push({pair:pair.name,status:'IDENTITY_NOT_VERIFIED',quotes:[]});continue}
  const pools=[];
  for(const [i,address] of [pair.origin,pair.alternate].entries()){
   const [r0,r1]=await new ethers.Contract(address,RESERVES,provider).getReserves({blockTag:b.number});
   const wethIsZero=a.token0.toLowerCase()===WETH.toLowerCase();
   pools.push({address,venue:i===0?'UNISWAP_V2':'SUSHISWAP_V2',
    weth:wethIsZero?r0:r1,other:wethIsZero?r1:r0});
  }
  const directions=[];
  for(const [f,s] of [[0,1],[1,0]]){
   directions.push({direction:f===0?'UNISWAP_TO_SUSHI':'SUSHI_TO_UNISWAP',
    quotes:sizes.map(amount=>roundTrip(amount,pools[f],pools[s]))});
  }
  const token=a.token0.toLowerCase()===WETH.toLowerCase()?a.token1:a.token0;
  results.push({pair:pair.name,status:'CONFIRMED_STATE_ONLY',token,
   compatibleWithExistingV26:token.toLowerCase()===MLN.toLowerCase(),
   reserves:pools.map(x=>({address:x.address,venue:x.venue,wethRaw:x.weth.toString(),otherRaw:x.other.toString()})),
   directions});
 }
 return {build:'BALANCER_RESEARCH_V33',mode:'READ_ONLY_CONFIRMED_STATE_TWO_VENUE_QUOTES',
  blockNumber:b.number,blockHash:b.hash,feeModel:'UNISWAP_V2_STYLE_997_1000_EACH_LEG',
  pairs:results,simulatedPostTargetState:false,flashLoanFeeIncluded:false,
  gasCostIncluded:false,liveNetProfitVerified:false,transactionHashesUsed:0,
  mainnetBroadcast:false,executionEligible:false,
  limitations:['RESERVE_SPOT_QUOTE_NOT_EXECUTABLE_TRANSACTION','MEV_SHARE_TARGET_EFFECT_UNKNOWN',
   'SLIPPAGE_GAS_FLASH_LOAN_AND_BUILDER_ECONOMICS_NOT_PROVEN','V26_IMMUTABLE_TOKEN_PAIR']};
}
module.exports={quote,roundTrip,assess,PAIRS};
if(require.main===module){
 if(!process.env.ETHEREUM_RPC_URL){console.log(JSON.stringify({build:'BALANCER_RESEARCH_V33',status:'BLOCKED',reason:'ETHEREUM_RPC_REQUIRED'}))}
 else{const p=new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
 assess({provider:p}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('V33_FAILED',String(e.message).slice(0,150));process.exitCode=1}).finally(()=>p.destroy());}
}
