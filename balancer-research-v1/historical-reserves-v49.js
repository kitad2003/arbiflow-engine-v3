'use strict';
// V49 historical confirmed-block reserve evidence. No fork execution or target replay.
const {ethers}=require('ethers');
const {expected}=require('./v26-mainnet-gate-v40');
const {sources}=require('./deployment-plan-v42');
const PAIR=['function getPair(address,address) view returns(address)'];
const POOL=['function factory() view returns(address)','function token0() view returns(address)','function token1() view returns(address)','function getReserves() view returns(uint112,uint112,uint32)'];
function quote(amount,reserveIn,reserveOut){if(amount<=0n||reserveIn<=0n||reserveOut<=0n)return 0n;return (amount*997n*reserveOut)/(reserveIn*1000n+amount*997n)}
function evaluate({amount,reservesA,reservesB}){const mid=quote(amount,reservesA[0],reservesA[1]);const returned=quote(mid,reservesB[0],reservesB[1]);return {borrowed:amount.toString(),middleAmount:mid.toString(),returned:returned.toString(),grossDifferenceWei:(returned-amount).toString(),gasAdjustedNetProfitVerified:false,targetFirstSimulated:false}}
async function inspect({provider,blockTag=21000000,amountWei=ethers.parseEther('1')}={}){
 const base={build:'BALANCER_RESEARCH_V49',mode:'HISTORICAL_ETHEREUM_RESERVE_EVIDENCE',sixSourcesTracked:sources.length,
 blockRequested:blockTag,borrowAmountWei:String(amountWei),chainIdVerified:false,historicalStateVerified:false,
 realTargetReplay:false,localForkExecution:false,flashLoanExecuted:false,signed:false,mainnetBroadcast:false,bundlesSubmitted:0};
 if(!provider)return {...base,status:'BLOCKED',reason:'RPC_NOT_CONFIGURED'};
 try{
 const chain=await provider.getNetwork();
 if(chain.chainId!==1n)return {...base,status:'BLOCKED',reason:'ETHEREUM_MAINNET_REQUIRED'};
 base.chainIdVerified=true;
 const block=await provider.getBlock(blockTag);
 if(!block)return {...base,status:'BLOCKED',reason:'HISTORICAL_BLOCK_NOT_AVAILABLE'};
 base.blockHash=block.hash;
 const items=[];
 for(const [label,fac] of [['UNISWAP_V2',expected.factoryA],['SUSHISWAP_V2',expected.factoryB]]){
  const factory=new ethers.Contract(fac,PAIR,provider);
  const pair=await factory.getPair(expected.loanToken,expected.intermediateToken,{blockTag});
  if(pair===ethers.ZeroAddress)return {...base,status:'BLOCKED',reason:label+'_PAIR_NOT_FOUND'};
  const p=new ethers.Contract(pair,POOL,provider);
  const [factoryAtBlock,t0,t1,r]=await Promise.all([
   p.factory({blockTag}),p.token0({blockTag}),p.token1({blockTag}),p.getReserves({blockTag})]);
  if(factoryAtBlock.toLowerCase()!==fac.toLowerCase())return {...base,status:'BLOCKED',reason:label+'_FACTORY_MISMATCH'};
  const loanIs0=t0.toLowerCase()===expected.loanToken.toLowerCase();
  const midIsOther=(loanIs0?t1:t0).toLowerCase()===expected.intermediateToken.toLowerCase();
  if(!midIsOther)return {...base,status:'BLOCKED',reason:label+'_TOKEN_PAIR_MISMATCH'};
  items.push({label,pair,factory:fac,reserveLoan:String(loanIs0?r[0]:r[1]),reserveIntermediate:String(loanIs0?r[1]:r[0]),reserveTimestamp:Number(r[2])});
 }
 const a=items[0],b=items[1];
 const forward=evaluate({amount:BigInt(amountWei),reservesA:[BigInt(a.reserveLoan),BigInt(a.reserveIntermediate)],reservesB:[BigInt(b.reserveIntermediate),BigInt(b.reserveLoan)]});
 const reverse=evaluate({amount:BigInt(amountWei),reservesA:[BigInt(b.reserveLoan),BigInt(b.reserveIntermediate)],reservesB:[BigInt(a.reserveIntermediate),BigInt(a.reserveLoan)]});
 return {...base,status:'HISTORICAL_RESERVES_VERIFIED_ONLY',historicalStateVerified:true,blockTimestamp:block.timestamp,
 pairs:items,forwardUniswapThenSushi:forward,reverseSushiThenUniswap:reverse,
 limitations:['CONFIRMED_BLOCK_RESERVES_NOT_POST_PENDING_TARGET_STATE','NO_FLASH_LOAN_FEE_OR_GAS_SUBTRACTED',
 'V26_ONLY_SUPPORTS_FACTORY_A_THEN_FACTORY_B','NO_ATOMIC_FORK_EXECUTION','NO_PROFITABLE_BACKRUN_PROVEN']};
 }catch(e){return {...base,status:'BLOCKED',reason:'HISTORICAL_RPC_READ_FAILED',detail:String(e.shortMessage||e.message).slice(0,210)}}
}
module.exports={quote,evaluate,inspect};
if(require.main===module){
 const p=process.env.ETHEREUM_RPC_URL?new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL):null;
 const block=Number(process.env.V49_HISTORICAL_BLOCK||21000000);
 inspect({provider:p,blockTag:block}).then(x=>console.log(JSON.stringify(x))).finally(()=>p?.destroy());
}