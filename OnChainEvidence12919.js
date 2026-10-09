'use strict';
// 12.9.19 read-only Base chain receipt evidence collection.
// Receipt is not proof of profitability; independent Aave + router attribution
// requires transaction-specific decoded traces and balance deltas.
const {ethers}=require('ethers');
const {normalize}=require('./VerifiedCostBridge12918');
const ERC20_TRANSFER=ethers.id('Transfer(address,address,uint256)');
const AAVE_POOL='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH='0x4200000000000000000000000000000000000006';
const AAVE_FLASH=ethers.id('FlashLoan(address,address,address,uint256,uint8,uint256,uint16)');
function safe(e){return String(e?.shortMessage||e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,180)}
async function collect({rpcUrl,txHash}){
 if(!/^https:\/\//.test(rpcUrl||''))throw Error('BASE_RPC_HTTPS_REQUIRED');
 if(!/^0x[0-9a-fA-F]{64}$/.test(txHash||''))throw Error('VALID_TX_HASH_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpcUrl,8453,{staticNetwork:true});
 try{
  if(BigInt(await p.send('eth_chainId',[]))!==8453n)throw Error('WRONG_CHAIN');
  const [receipt,tx]=await Promise.all([p.getTransactionReceipt(txHash),p.getTransaction(txHash)]);
  if(!receipt||!tx)return {success:true,build:'12.9.19',transactionFound:false,verified:false,qualified:false,alerts:[],readOnly:true,mainnetBroadcast:false};
  const block=await p.getBlock(receipt.blockNumber);
  if(!block||block.hash.toLowerCase()!==receipt.blockHash.toLowerCase())throw Error('BLOCK_RECEIPT_HASH_MISMATCH');
  const transfers=receipt.logs.filter(l=>l.topics[0]===ERC20_TRANSFER&&[USDC.toLowerCase(),WETH.toLowerCase()].includes(l.address.toLowerCase())).map(l=>({token:l.address,transactionLogIndex:l.index,from:'0x'+l.topics[1]?.slice(-40),to:'0x'+l.topics[2]?.slice(-40),amountRaw:l.data})).filter(t=>t.from&&t.to);
  const aaveLogs=receipt.logs.filter(l=>l.address.toLowerCase()===AAVE_POOL.toLowerCase()&&l.topics[0]===AAVE_FLASH);
  const gasUsed=BigInt(receipt.gasUsed),effectiveGasPrice=BigInt(receipt.gasPrice??0);
  const gasPaidWei=(gasUsed*effectiveGasPrice).toString();
  const gate=normalize({sourceMode:'MAINNET_SETTLED_RECEIPT',receiptStatus:receipt.status,aaveRepaymentEvidenceVerified:false,dexSwapEvidenceVerified:false,l1CostReceiptVerified:false,gasCostReceiptVerified:receipt.status===1&&effectiveGasPrice>0n,oracleConversionVerified:false,slippageBufferVerified:false,blockQuoteFreshnessVerified:false,riskSourceVerified:false});
  return {success:true,build:'12.9.19',chainId:8453,txHash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,transactionFound:true,receiptStatus:receipt.status,gasUsed:gasUsed.toString(),effectiveGasPriceWei:effectiveGasPrice.toString(),executionGasPaidWei:gasPaidWei,gasMayIncludeL1Components:true,avoidDoubleCountingL1:true,aaveFlashLoanEventCount:aaveLogs.length,trackedUsdcWethTransferCount:transfers.length,transfers:transfers.slice(0,30),l1FeeWei:null,verifiedGasCostUsdcRaw:null,aaveRepaymentVerified:false,bothDexSwapsVerified:false,finalNetProfitVerified:false,qualified:gate.qualified,reasons:gate.reasons,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false};
 }finally{p.destroy()}
}
module.exports={collect};
if(require.main===module){
 const assert=require('node:assert/strict');
 assert.equal(ERC20_TRANSFER,ethers.id('Transfer(address,address,uint256)'));
 assert.equal(normalize({sourceMode:'MAINNET_SETTLED_RECEIPT',receiptStatus:1}).qualified,false);
 assert.equal(/^0x[0-9a-fA-F]{64}$/.test('0x'+'1'.repeat(64)),true);
 console.log(JSON.stringify({success:true,build:'12.9.19',unitChecksPassed:3,mode:'READ_ONLY_RECEIPT_EVIDENCE_COLLECTOR',mainnetBroadcast:false,qualified:0,alerts:[]}));
 if(process.env.BASE_RPC_URL&&process.env.EVIDENCE_TX_HASH)collect({rpcUrl:process.env.BASE_RPC_URL,txHash:process.env.EVIDENCE_TX_HASH}).then(v=>console.log(JSON.stringify(v))).catch(e=>{console.error('EVIDENCE_COLLECT_FAILED',safe(e));process.exitCode=1});
}
