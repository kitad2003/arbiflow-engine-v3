'use strict';
// ArbiFlow 12.9.22 - actual Base receipt gas accounting, without invented prices.
// OP-stack receipts may expose l1Fee separately; ethers Receipt does not standardize it.
// Read raw eth_getTransactionReceipt so provider-specific L1 values are not discarded.
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {normalize}=require('./VerifiedCostBridge12918');
function quantity(v,label){
 if(typeof v!=='string'||!/^0x[0-9a-fA-F]+$/.test(v))throw Error('MISSING_OR_INVALID_'+label);
 return BigInt(v);
}
function calculate(raw){
 if(!raw||typeof raw!=='object')throw Error('RECEIPT_REQUIRED');
 if(raw.status!=='0x1')return {verified:false,reasons:['RECEIPT_NOT_SUCCESSFUL'],executionGasWei:null,l1FeeWei:null,totalGasWei:null};
 const reasons=[];
 let used,price,l1;
 try{used=quantity(raw.gasUsed,'GAS_USED');price=quantity(raw.effectiveGasPrice,'EFFECTIVE_GAS_PRICE');if(used===0n||price===0n)reasons.push('ZERO_EXECUTION_GAS_OR_PRICE');}
 catch(e){reasons.push(e.message)}
 // Conservative: absent L1 fee is UNKNOWN, not zero. Do not double-count it.
 try{l1=quantity(raw.l1Fee,'L1_FEE')}catch{reasons.push('L1_FEE_NOT_IN_RECEIPT')}
 const execution=used!==undefined&&price!==undefined?used*price:null;
 const total=execution!==null&&l1!==undefined?execution+l1:null;
 return {verified:reasons.length===0,reasons,executionGasWei:execution?.toString()??null,l1FeeWei:l1?.toString()??null,totalGasWei:total?.toString()??null,l1GasUsed:raw.l1GasUsed??null,l1GasPrice:raw.l1GasPrice??null,l1FeeScalar:raw.l1FeeScalar??null,gasCostUsdcRaw:null,ethUsdcPriceVerified:false,priceConversionMissing:true};
}
async function inspect({rpcUrl,txHash}){
 if(!/^https:\/\//.test(rpcUrl||''))throw Error('HTTPS_BASE_RPC_REQUIRED');
 if(!/^0x[0-9a-fA-F]{64}$/.test(txHash||''))throw Error('TX_HASH_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpcUrl,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n,'NOT_BASE');
  const raw=await p.send('eth_getTransactionReceipt',[txHash]);
  if(!raw)return {success:true,build:'12.9.22',transactionFound:false,qualified:false,alerts:[]};
  const tx=await p.getTransaction(txHash);
  const block=await p.getBlock(Number(BigInt(raw.blockNumber)));
  if(!tx||!block||block.hash.toLowerCase()!==raw.blockHash.toLowerCase())throw Error('BLOCK_TX_RECEIPT_COHERENCE_FAILED');
  const gas=calculate(raw);
  const gate=normalize({sourceMode:'MAINNET_SETTLED_RECEIPT',receiptStatus:raw.status==='0x1'?1:0,gasCostReceiptVerified:gas.verified,l1CostReceiptVerified:gas.verified,oracleConversionVerified:false,aaveRepaymentEvidenceVerified:false,dexSwapEvidenceVerified:false,slippageBufferVerified:false,blockQuoteFreshnessVerified:false,riskSourceVerified:false});
  return {success:true,build:'12.9.22',txHash,blockNumber:Number(BigInt(raw.blockNumber)),...gas,verifiedNetProfit:false,qualified:gate.qualified,alerts:[],reasons:[...new Set([...gas.reasons,...gate.reasons])],readOnly:true,mainnetBroadcast:false,executionEligible:false};
 }finally{p.destroy();}
}
module.exports={calculate,inspect};
if(require.main===module){
 const ok={status:'0x1',gasUsed:'0x186a0',effectiveGasPrice:'0x3b9aca00',l1Fee:'0x77359400'};
 const a=calculate(ok);
 assert.equal(a.verified,true);
 assert.equal(a.executionGasWei,'100000000000000');
 assert.equal(a.l1FeeWei,'2000000000');
 assert.equal(a.totalGasWei,'100002000000000');
 assert.equal(calculate({...ok,l1Fee:undefined}).verified,false);
 assert.equal(calculate({...ok,l1Fee:undefined}).totalGasWei,null);
 assert.equal(calculate({...ok,status:'0x0'}).verified,false);
 assert.equal(calculate({...ok,l1Fee:'0x0'}).totalGasWei,'100000000000000');
 assert.equal(normalize({sourceMode:'MAINNET_SETTLED_RECEIPT',receiptStatus:1,gasCostReceiptVerified:true,l1CostReceiptVerified:true}).qualified,false);
 console.log(JSON.stringify({success:true,build:'12.9.22',unitAssertionsPassed:8,syntheticInputsOnly:true,realBaseReceiptInspected:false,liveNetProfitVerified:false,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false}));
 if(process.env.EVIDENCE_TX_HASH&&process.env.BASE_RPC_URL)inspect({rpcUrl:process.env.BASE_RPC_URL,txHash:process.env.EVIDENCE_TX_HASH}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('BASE_GAS_EVIDENCE_FAILED',String(e?.shortMessage||e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,250));process.exitCode=1});
}
