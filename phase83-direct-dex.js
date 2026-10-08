'use strict';
// Manual, read-only direct Uniswap V3 Base contract connectivity diagnostic.
const {Interface}=require('ethers');
const CHAIN=8453;
const CONTRACTS=Object.freeze({factory:'0x33128a8fC17869897dcE68Ed026d694621f6FDfD',quoterV2:'0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',router:'0x2626664c2603336E57B271c5C0b26F421741e481',USDC:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',WETH:'0x4200000000000000000000000000000000000006'});
const factoryAbi=new Interface(['function getPool(address,address,uint24) view returns(address)']);
const poolAbi=new Interface(['function token0() view returns(address)','function token1() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)','function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)']);
const quoterAbi=new Interface(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
function safeError(e){return String(e?.shortMessage||e?.message||e).replace(/https?:\/\/[^\s]+/g,'[RPC_URL_REDACTED]').slice(0,220)}
function mount(app,{getBaseChain,rpc}){
 const state={running:false,runs:0,lastStartedAt:null,lastCompletedAt:null,lastResult:null};
 const safety={readOnly:true,automaticScanning:false,mainnetBroadcast:false,executionEligible:false};
 app.get('/api/phase83/status',(_req,res)=>res.json({success:true,build:'8.3.0',stage:'DIRECT_BASE_UNISWAP_V3_CONTRACT_PROBE',...state,contracts:CONTRACTS,safety}));
 async function execute(){
  const chain=getBaseChain();if(!chain||chain.chainId!==CHAIN)throw Error('BASE_CHAIN_NOT_CONFIGURED');
  const steps=[];const call=async(to,iface,fn,args=[],block='latest')=>{const raw=await rpc(chain,'eth_call',[{to,data:iface.encodeFunctionData(fn,args)},block]);return iface.decodeFunctionResult(fn,raw)};
  const chainHex=await rpc(chain,'eth_chainId',[]);const id=Number(BigInt(chainHex));if(id!==CHAIN)throw Error('RPC_WRONG_CHAIN_'+id);steps.push({check:'CHAIN_ID',passed:true,chainId:id});
  const blockHex=await rpc(chain,'eth_blockNumber',[]);const blockNumber=Number(BigInt(blockHex));const block=blockHex;steps.push({check:'PINNED_BLOCK',passed:true,blockNumber});
  for(const [name,address] of [['factory',CONTRACTS.factory],['quoterV2',CONTRACTS.quoterV2],['router',CONTRACTS.router]]){const code=await rpc(chain,'eth_getCode',[address,block]);if(!code||code==='0x')throw Error(name.toUpperCase()+'_CONTRACT_CODE_MISSING');steps.push({check:'CONTRACT_CODE',contract:name,address,passed:true,bytecodeBytes:(code.length-2)/2});}
  let pool=null,fee=null;for(const tier of [500,3000,10000]){const [address]=await call(CONTRACTS.factory,factoryAbi,'getPool',[CONTRACTS.USDC,CONTRACTS.WETH,tier],block);steps.push({check:'FACTORY_GET_POOL',feeTier:tier,address,exists:address!=='0x0000000000000000000000000000000000000000'});if(!pool&&address!=='0x0000000000000000000000000000000000000000'){pool=address;fee=tier;}}
  if(!pool)throw Error('NO_USDC_WETH_POOL_IN_TESTED_FEE_TIERS');
  const code=await rpc(chain,'eth_getCode',[pool,block]);if(!code||code==='0x')throw Error('POOL_CODE_MISSING');
  const [token0]=await call(pool,poolAbi,'token0',[],block);const [token1]=await call(pool,poolAbi,'token1',[],block);const [actualFee]=await call(pool,poolAbi,'fee',[],block);const [liquidity]=await call(pool,poolAbi,'liquidity',[],block);const slot=await call(pool,poolAbi,'slot0',[],block);
  if(![token0.toLowerCase(),token1.toLowerCase()].includes(CONTRACTS.USDC.toLowerCase())||![token0.toLowerCase(),token1.toLowerCase()].includes(CONTRACTS.WETH.toLowerCase())||Number(actualFee)!==fee)throw Error('POOL_IDENTITY_MISMATCH');
  steps.push({check:'POOL_STATE',passed:true,pool,token0,token1,feeTier:fee,activeLiquidity:liquidity.toString(),sqrtPriceX96:slot[0].toString(),unlocked:slot[6],note:'Active liquidity is not USD reserves or executable depth'});
  const amountIn=1000000n;let quote=null;
  try{const decoded=await call(CONTRACTS.quoterV2,quoterAbi,'quoteExactInputSingle',[[CONTRACTS.USDC,CONTRACTS.WETH,amountIn,fee,0]],block);quote={passed:true,inputAsset:'USDC',inputRaw:amountIn.toString(),outputAsset:'WETH',outputRaw:decoded[0].toString(),gasEstimate:decoded[3].toString(),note:'Read-only eth_call; gasEstimate is quoter metric, not total transaction gas'};}
  catch(e){quote={passed:false,error:safeError(e)};}
  steps.push({check:'QUOTER_V2',...quote});
  return {success:true,build:'8.3.0',stage:'DIRECT_DEX_CONTRACT_VERIFICATION',chainId:CHAIN,blockNumber,verifiedPool:pool,poolIdentityVerified:true,quoteVerified:!!quote.passed,verifiedOperationalSources:quote.passed?1:0,steps,limitations:['SINGLE_BASE_POOL_ONLY','NO_FLASH_LOAN','NO_ATOMIC_FORK_SIMULATION','NO_GAS_NET_PROFIT','NO_PERSISTENT_DATABASE'],safety};
 }
 app.get('/api/phase83/run',(req,res)=>{if(state.running)return res.status(409).json({success:false,error:'PROBE_ALREADY_RUNNING',safety});state.running=true;state.runs++;state.lastStartedAt=new Date().toISOString();setImmediate(async()=>{try{state.lastResult=await execute()}catch(e){state.lastResult={success:false,build:'8.3.0',error:safeError(e),safety}}finally{state.running=false;state.lastCompletedAt=new Date().toISOString()}});res.json({success:true,status:'STARTED_BACKGROUND',statusRoute:'/api/phase83/status',safety});});
 return {state};
}
module.exports={mount};
