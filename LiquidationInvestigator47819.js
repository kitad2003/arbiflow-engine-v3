'use strict';
const {JsonRpcProvider, Interface} = require('ethers');
const EVENT_ABI = [
 'event LiquidationCall(address indexed collateralAsset,address indexed debtAsset,address indexed user,uint256 debtToCover,uint256 liquidatedCollateralAmount,address liquidator,bool receiveAToken)',
 'event FlashLoan(address indexed target,address initiator,address indexed asset,uint256 amount,uint8 interestRateMode,uint256 premium,uint16 referralCode)'
];
const iface = new Interface(EVENT_ABI);
const signatures = new Map(EVENT_ABI.map(x => {const e=iface.getEvent(x.match(/event (\w+)/)[1]);return [e.topicHash.toLowerCase(),e.name];}));
function clean(v){if(typeof v==='bigint')return v.toString();if(Array.isArray(v))return v.map(clean);return v;}
async function inspect({chain,hash,rpcUrls}) {
 if(!['base','arbitrum','optimism'].includes(chain))throw Error('UNSUPPORTED_CHAIN');
 if(!/^0x[0-9a-fA-F]{64}$/.test(hash||''))throw Error('INVALID_TRANSACTION_HASH');
 const url=rpcUrls[chain];if(!url)throw Error('RPC_NOT_CONFIGURED');
 const provider=new JsonRpcProvider(url,undefined,{staticNetwork:false});
 try {
  const receipt=await provider.getTransactionReceipt(hash);
  if(!receipt)return {found:false,chain,hash,warning:'TRANSACTION_NOT_FOUND'};
  const matches=[];
  for(const log of receipt.logs){
   const name=signatures.get((log.topics[0]||'').toLowerCase());if(!name)continue;
   let args=null,decodeError=null;
   try{const parsed=iface.parseLog({topics:log.topics,data:log.data});args=Object.fromEntries(parsed.fragment.inputs.map((v,i)=>[v.name,clean(parsed.args[i])]));}catch(e){decodeError='ABI_DECODE_FAILED';}
   matches.push({eventCandidate:name,emitter:log.address,logIndex:log.index,arguments:args,decodeError,protocolIdentityVerified:false});
  }
  return {found:true,chain,hash,blockNumber:receipt.blockNumber,transactionSucceeded:receipt.status===1,gasUsed:receipt.gasUsed.toString(),gasPriceWei:receipt.gasPrice?.toString()||null,feePaidNativeWei:receipt.fee?.toString()||null,logsInspected:receipt.logs.length,matchingEventSignatures:matches.length,candidates:matches,verifiedProfitUsd:null,flashLoanRepaymentVerified:false,liquidationProfitVerified:false,atomicSimulationVerified:false,limitations:['EVENT_SIGNATURE_MATCH_IS_NOT_PROTOCOL_IDENTITY_VERIFICATION','TOKEN_DECIMALS_AND_PRICES_NOT_RESOLVED','FULL_INTERNAL_CALL_TRACES_NOT_ANALYZED','NO_COLLATERAL_EXIT_SWAP_RECONSTRUCTION','NO_NET_PROFIT_OR_LOAN_REPAYMENT_PROOF'],safety:{readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false}};
 } finally {provider.destroy();}
}
module.exports={inspect};
