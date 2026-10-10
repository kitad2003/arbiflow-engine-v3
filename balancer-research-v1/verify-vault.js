'use strict';
// Read-only Balancer V2-style Vault verification. No transactions, signing or execution.
// Research: Flashbots Balancer flash-loan basics, Balancer Vault callback.
// Vault and token addresses MUST come from explicit research inputs, not hardcoded guesses.
const {ethers}=require('ethers');
const VAULT_ABI=[
 'function getProtocolFeesCollector() view returns(address)',
 'function getAuthorizer() view returns(address)'
];
const FEES_ABI=['function getFlashLoanFeePercentage() view returns(uint256)'];
const TOKEN_ABI=['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','function symbol() view returns(string)'];
function address(x){return typeof x==='string'&&ethers.isAddress(x)&&x!==ethers.ZeroAddress}
async function verify({rpcUrl,vaultAddress,tokenAddress,expectedChainId=8453,provider:givenProvider}){
 if(!address(vaultAddress)||!address(tokenAddress))throw Error('EXPLICIT_VAULT_AND_TOKEN_ADDRESSES_REQUIRED');
 if(!givenProvider&&!/^https:\/\//.test(rpcUrl||''))throw Error('HTTPS_RPC_REQUIRED');
 const provider=givenProvider||new ethers.JsonRpcProvider(rpcUrl,expectedChainId,{staticNetwork:true});
 try{
  const chain=await provider.getNetwork();
  if(Number(chain.chainId)!==expectedChainId)throw Error('UNEXPECTED_CHAIN');
  const block=await provider.getBlock('latest');
  if(!block||!block.hash)throw Error('CONFIRMED_BLOCK_UNAVAILABLE');
  const tag=block.number;
  const code=await provider.getCode(vaultAddress,tag);
  if(code==='0x')throw Error('NO_VAULT_CODE');
  const vault=new ethers.Contract(vaultAddress,VAULT_ABI,provider);
  const [feeCollector,authorizer]=await Promise.all([
   vault.getProtocolFeesCollector({blockTag:tag}),vault.getAuthorizer({blockTag:tag})
  ]);
  if(!address(feeCollector)||!address(authorizer))throw Error('VAULT_INTERFACE_INCOMPATIBLE');
  if((await provider.getCode(feeCollector,tag))==='0x')throw Error('FEES_COLLECTOR_NOT_CONTRACT');
  const fees=new ethers.Contract(feeCollector,FEES_ABI,provider);
  const token=new ethers.Contract(tokenAddress,TOKEN_ABI,provider);
  const [feeRaw,balance,decimals,symbol]=await Promise.all([
   fees.getFlashLoanFeePercentage({blockTag:tag}),
   token.balanceOf(vaultAddress,{blockTag:tag}),
   token.decimals({blockTag:tag}),token.symbol({blockTag:tag})
  ]);
  const fee=BigInt(feeRaw);
  if(fee>10n**18n)throw Error('FEE_ABOVE_100_PERCENT');
  if(Number(decimals)>36)throw Error('UNEXPECTED_TOKEN_DECIMALS');
  return {build:'BALANCER_RESEARCH_V3',mode:'READ_ONLY_VAULT_INTERFACE_AND_BALANCE',
   chainId:expectedChainId,blockNumber:tag,blockHash:block.hash,
   vault:vaultAddress,protocolFeesCollector:feeCollector,
   token:{address:tokenAddress,symbol,decimals:Number(decimals),vaultBalanceRaw:balance.toString()},
   flashLoanFeePercentageRaw:fee.toString(),feeDenominator:'1000000000000000000',
   vaultReadMethodsVerified:true,flashLoanMethodCallableVerified:false,
   flashLoanLiquidityGuaranteed:false,flashLoanExecuted:false,profitVerified:false,
   mainnetBroadcast:false,executionEligible:false,
   limitations:['CALLABLE_READ_METHODS_DO_NOT_AUTHENTICATE_CANONICAL_VAULT',
    'TOKEN_BALANCE_NOT_PROOF_OF_FLASH_LOAN_AVAILABILITY',
    'FEE_MAY_CHANGE','NEEDS_LOCAL_FORK_FLASH_LOAN_TEST','NO_SWAPS_OR_PROFIT_TEST']};
 }finally{if(!givenProvider)provider.destroy()}
}
if(require.main===module)verify({rpcUrl:process.env.BALANCER_RESEARCH_RPC_URL,
 vaultAddress:process.env.BALANCER_RESEARCH_VAULT_ADDRESS,
 tokenAddress:process.env.BALANCER_RESEARCH_TOKEN_ADDRESS,
 expectedChainId:Number(process.env.BALANCER_RESEARCH_CHAIN_ID||8453)})
 .then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('BALANCER_READ_ONLY_VERIFY_FAILED',String(e.shortMessage||e.message||e).slice(0,240));process.exitCode=1});
module.exports={verify};
