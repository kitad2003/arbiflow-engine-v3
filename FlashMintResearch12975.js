'use strict';
// ArbiFlow 12.9.75 ERC-3156 Flash Mint provider investigator. No transaction broadcasts.
// Documented Ethereum mainnet GHO minter; Base must be explicitly verified, never assumed.
const assert=require('node:assert/strict'),fs=require('node:fs'),{ethers}=require('ethers');
const ABI=['function maxFlashLoan(address token) view returns(uint256)','function flashFee(address token,uint256 amount) view returns(uint256)'];
const SOURCES=[{name:'GHO_FLASH_MINTER',chainId:1,lender:'0xb639D208Bcf0589D54FaC24E655C79EC529762B8',token:'0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',source:'https://www.aave.com/docs/ecosystem/gho'}];
const SIZES=[500,1000,2500,5000,10000,25000,50000];
function error(e){return String(e?.shortMessage||e?.message||e).slice(0,150)}
async function probe(rpc,chainId,entry){
 const provider=new ethers.JsonRpcProvider(rpc,chainId,{staticNetwork:true});
 try{
  assert.equal(Number((await provider.getNetwork()).chainId),chainId,'WRONG_CHAIN');
  const block=await provider.getBlockNumber();
  const [lc,tc]=await Promise.all([provider.getCode(entry.lender,block),provider.getCode(entry.token,block)]);
  if(lc==='0x'||tc==='0x')return {...entry,block,verified:false,error:'LENDER_OR_TOKEN_NOT_DEPLOYED'};
  const c=new ethers.Contract(entry.lender,ABI,provider);
  const token=new ethers.Contract(entry.token,['function decimals() view returns(uint8)','function symbol() view returns(string)'],provider);
  const decimals=Number(await token.decimals({blockTag:block}));
  const symbol=await token.symbol({blockTag:block});
  const max=BigInt(await c.maxFlashLoan(entry.token,{blockTag:block}));
  const amounts=[];
  for(const usd of SIZES){
   const amount=BigInt(usd)*10n**BigInt(decimals);
   try{const fee=BigInt(await c.flashFee(entry.token,amount,{blockTag:block}));
    amounts.push({amountTokens:usd,availableByCapacity:max>=amount,feeRaw:fee.toString(),feeTokens:ethers.formatUnits(fee,decimals)});
   }catch(e){amounts.push({amountTokens:usd,verified:false,error:error(e)})}
  }
  return {...entry,block,verified:true,symbol,decimals,maxFlashLoanRaw:max.toString(),maxFlashLoanTokens:ethers.formatUnits(max,decimals),amounts};
 }catch(e){return {...entry,verified:false,error:error(e)}}finally{provider.destroy()}
}
async function main(){
 const results=[],baseRpc=process.env.BASE_RPC_URL,ethRpc=process.env.ETHEREUM_RPC_URL;
 if(baseRpc){
  // Base adapter is opt-in only. No hardcoded or guessed address.
  const lender=process.env.BASE_ERC3156_LENDER,token=process.env.BASE_ERC3156_TOKEN;
  if(lender&&token&&ethers.isAddress(lender)&&ethers.isAddress(token))
   results.push(await probe(baseRpc,8453,{name:'USER_CONFIGURED_BASE_ERC3156',chainId:8453,lender,token,source:'USER_CONFIGURED_NOT_OFFICIALLY_VERIFIED'}));
  else results.push({name:'BASE',chainId:8453,verified:false,status:'NO_PROVIDER_ADDRESS_CONFIGURED',reason:'No Base ERC-3156 flash minter independently established; require explicit verified lender and token address'});
 }
 if(ethRpc)for(const entry of SOURCES)results.push(await probe(ethRpc,1,entry));
 else results.push({name:'ETHEREUM_GHO',chainId:1,verified:false,status:'ETHEREUM_RPC_URL_NOT_CONFIGURED',documented:SOURCES[0]});
 const report={build:'12.9.75',mode:'ERC3156_FLASH_MINT_FUNDING_RESEARCH',providerResults:results,
  comparisons:{balancer:'EXISTING_BASE_FLASH_LOAN_ENGINE_SEPARATE',liquidations:'INDEPENDENT_PROFIT_STRATEGY_NOT_EXECUTED',arbitrage:'NO_SWAP_ROUTE_TESTED'},
  observedPositiveProfitUsd:null,profitVerified:false,atomicForkVerified:false,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,
  limitations:['PROVIDER_CAPACITY_AND_FEES_ARE_NOT_PROFIT','NO_FLASH_MINT_CALLBACK_EXECUTED','NO_SWAP_OR_LIQUIDATION_TEST','NO_BASE_PROVIDER_PREDEFINED','NO_GAS_COSTS']};
 fs.writeFileSync('arbiflow-flash-mint-research-12975.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
 return report;
}
if(require.main===module){assert.equal(SIZES.length,7);assert(ethers.isAddress(SOURCES[0].lender));console.log(JSON.stringify({build:'12.9.75',unitAssertionsPassed:2}));
 main().catch(e=>{console.error('FLASH_MINT_RESEARCH_FAILED',error(e));process.exitCode=1})}
module.exports={main,probe};
