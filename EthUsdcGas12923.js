'use strict';
// 12.9.23: ETH-denominated Base receipt costs -> USDC microunits.
// Real price evidence must be chain-specific and block-anchored; never use floating point.
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {calculate}=require('./BaseGasReceipt12922');
const PRICE_FEED='0x71041dddad3595f9e3e1e2e5e3b8ee68ed1c56';
function convert({gas,priceAnswer,priceDecimals,priceUpdatedAt,receiptBlockTimestamp,sourceVerified}){
 const reasons=[];
 if(gas?.verified!==true||!/^(0|[1-9][0-9]*)$/.test(String(gas?.totalGasWei??'')))reasons.push('RECEIPT_GAS_UNVERIFIED');
 const validPrice=/^[1-9][0-9]*$/.test(String(priceAnswer??''))&&Number.isInteger(priceDecimals)&&priceDecimals>=0&&priceDecimals<=18;
 if(!validPrice)reasons.push('PRICE_INVALID');
 if(!Number.isSafeInteger(priceUpdatedAt)||!Number.isSafeInteger(receiptBlockTimestamp)||priceUpdatedAt>receiptBlockTimestamp||receiptBlockTimestamp-priceUpdatedAt>3600)reasons.push('PRICE_STALE_OR_FUTURE');
 if(sourceVerified!==true)reasons.push('PRICE_ORACLE_SOURCE_UNVERIFIED');
 if(reasons.length)return {verified:false,reasons,executionGasUsdcRaw:null,l1FeeUsdcRaw:null,totalGasUsdcRaw:null,qualified:false};
 const denom=10n**(18n+BigInt(priceDecimals));
 const toUsdc=wei=>(BigInt(wei)*BigInt(priceAnswer)*1000000n+denom-1n)/denom;
 const execution=toUsdc(gas.executionGasWei),l1=toUsdc(gas.l1FeeWei);
 return {verified:true,reasons:[],executionGasUsdcRaw:execution.toString(),l1FeeUsdcRaw:l1.toString(),totalGasUsdcRaw:(execution+l1).toString(),qualified:false};
}
async function inspect({rpcUrl,txHash,oracleAddress}){
 if(!/^https:\/\//.test(rpcUrl||'')||!/^0x[0-9a-fA-F]{64}$/.test(txHash||''))throw Error('VALID_RPC_AND_TX_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpcUrl,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n);
  const raw=await p.send('eth_getTransactionReceipt',[txHash]);
  if(!raw)return {success:true,build:'12.9.23',transactionFound:false,qualified:false,alerts:[]};
  const block=await p.getBlock(Number(BigInt(raw.blockNumber)));
  if(!block||block.hash.toLowerCase()!==String(raw.blockHash).toLowerCase())throw Error('RECEIPT_BLOCK_MISMATCH');
  const gas=calculate(raw);
  // Address is operator-configured pending an independent feed authenticity review.
  const configured=ethers.isAddress(oracleAddress||'')?oracleAddress:null;
  let price=null,oracleError=null;
  if(configured){
   try{
    const oracle=new ethers.Contract(configured,['function decimals() view returns(uint8)','function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)'],p);
    const [decimals,round]=await Promise.all([oracle.decimals({blockTag:block.number}),oracle.latestRoundData({blockTag:block.number})]);
    price={answer:round[1].toString(),decimals:Number(decimals),updatedAt:Number(round[3]),roundId:round[0].toString(),answeredInRound:round[4].toString()};
   }catch(e){oracleError=String(e?.shortMessage||e?.message||e).slice(0,150);}
  }
  // Never treat arbitrary environment-supplied feed addresses as verified.
  const converted=convert({gas,priceAnswer:price?.answer,priceDecimals:price?.decimals,priceUpdatedAt:price?.updatedAt,receiptBlockTimestamp:block.timestamp,sourceVerified:false});
  return {success:true,build:'12.9.23',txHash,blockNumber:block.number,gas,oracleAddress:configured,oracleData:price,oracleError,...converted,sourceVerificationPending:true,netProfitVerified:false,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false};
 }finally{p.destroy();}
}
module.exports={convert,inspect};
if(require.main===module){
 const gas=calculate({status:'0x1',gasUsed:'0x186a0',effectiveGasPrice:'0x3b9aca00',l1Fee:'0x0'});
 const valid={gas,priceAnswer:'300000000000',priceDecimals:8,priceUpdatedAt:1000,receiptBlockTimestamp:1000,sourceVerified:true};
 assert.equal(convert(valid).verified,true);
 assert.equal(convert(valid).totalGasUsdcRaw,'300000');
 assert.equal(convert({...valid,sourceVerified:false}).verified,false);
 assert.equal(convert({...valid,priceUpdatedAt:0}).verified,true);
 assert.equal(convert({...valid,receiptBlockTimestamp:5000}).verified,false);
 assert.equal(convert({...valid,gas:{verified:false}}).verified,false);
 assert.equal(convert({...valid,priceAnswer:'0'}).verified,false);
 console.log(JSON.stringify({success:true,build:'12.9.23',syntheticChecksPassed:7,oracleAddressNotAutoTrusted:true,realGasConversionVerified:false,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false}));
 if(process.env.BASE_RPC_URL&&process.env.EVIDENCE_TX_HASH)inspect({rpcUrl:process.env.BASE_RPC_URL,txHash:process.env.EVIDENCE_TX_HASH,oracleAddress:process.env.ETH_USD_ORACLE_ADDRESS}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error('GAS_CONVERSION_FAILED',String(e?.shortMessage||e?.message||e).slice(0,230));process.exitCode=1});
}
