'use strict';
// 12.9.24 authoritative Base ETH/USD Chainlink standard proxy read.
// The fixed address is cross-referenced to Chainlink's Base ETH/USD Standard feed.
// Diagnostic is read-only and never qualifies an arbitrage opportunity.
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {convert}=require('./EthUsdcGas12923');
const {calculate}=require('./BaseGasReceipt12922');
const FEED='0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70';
const ABI=['function decimals() view returns(uint8)','function description() view returns(string)','function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)'];
function verifyRound({address,description,decimals,round,blockTimestamp}){
 const reasons=[];
 if(String(address||'').toLowerCase()!==FEED.toLowerCase())reasons.push('NOT_APPROVED_BASE_ETH_USD_STANDARD_PROXY');
 if(typeof description!=='string'||!/^ETH\s*\/\s*USD$/i.test(description.trim()))reasons.push('WRONG_ORACLE_PAIR');
 if(!Number.isInteger(decimals)||decimals!==8)reasons.push('UNEXPECTED_DECIMALS');
 if(!round||!/^\d+$/.test(String(round.answer??''))||BigInt(round?.answer||0)<=0n)reasons.push('NONPOSITIVE_PRICE');
 if(!round||!/^\d+$/.test(String(round.roundId??''))||BigInt(round?.roundId||0)<=0n)reasons.push('INVALID_ROUND');
 if(!Number.isSafeInteger(round?.updatedAt)||!Number.isSafeInteger(blockTimestamp)||round.updatedAt>blockTimestamp||blockTimestamp-round.updatedAt>3600)reasons.push('STALE_OR_FUTURE_PRICE');
 return {verified:reasons.length===0,reasons,priceAnswer:reasons.length===0?String(round.answer):null,decimals:reasons.length===0?decimals:null};
}
async function checkLive({rpcUrl,txHash}){
 if(!/^https:\/\//.test(rpcUrl||''))throw Error('HTTPS_RPC_REQUIRED');
 const p=new ethers.JsonRpcProvider(rpcUrl,8453,{staticNetwork:true});
 try{
  assert.equal(BigInt(await p.send('eth_chainId',[])),8453n,'BASE_ONLY');
  const pinned=txHash?await p.send('eth_getTransactionReceipt',[txHash]):null;
  if(txHash&&!pinned)throw Error('TX_RECEIPT_NOT_FOUND');
  const tag=pinned?Number(BigInt(pinned.blockNumber)):await p.getBlockNumber();
  const block=await p.getBlock(tag);
  assert(block,'BLOCK_UNAVAILABLE');
  const code=await p.getCode(FEED,tag);
  assert.notEqual(code,'0x','CHAINLINK_PROXY_CODE_MISSING');
  const contract=new ethers.Contract(FEED,ABI,p);
  const [decimals,description,latest]=await Promise.all([contract.decimals({blockTag:tag}),contract.description({blockTag:tag}),contract.latestRoundData({blockTag:tag})]);
  const round={roundId:latest[0].toString(),answer:latest[1].toString(),updatedAt:Number(latest[3])};
  const proof=verifyRound({address:FEED,description,decimals:Number(decimals),round,blockTimestamp:block.timestamp});
  const gas=pinned?calculate(pinned):null;
  const conversion=gas?convert({gas,priceAnswer:round.answer,priceDecimals:Number(decimals),priceUpdatedAt:round.updatedAt,receiptBlockTimestamp:block.timestamp,sourceVerified:proof.verified}):null;
  return {success:true,build:'12.9.24',chainId:8453,source:'CHAINLINK_BASE_ETH_USD_STANDARD',oracleAddress:FEED,blockNumber:tag,description,round,...proof,receiptGas:gas,gasConversion:conversion,qualified:false,alerts:[],netProfitVerified:false,readOnly:true,mainnetBroadcast:false,executionEligible:false};
 }finally{p.destroy()}
}
module.exports={FEED,verifyRound,checkLive};
if(require.main===module){
 const clean={address:FEED,description:'ETH / USD',decimals:8,round:{answer:'300000000000',roundId:'1',updatedAt:1000},blockTimestamp:1001};
 assert.equal(verifyRound(clean).verified,true);
 assert.equal(verifyRound({...clean,address:'0x0000000000000000000000000000000000000001'}).verified,false);
 assert.equal(verifyRound({...clean,description:'BTC / USD'}).verified,false);
 assert.equal(verifyRound({...clean,decimals:18}).verified,false);
 assert.equal(verifyRound({...clean,round:{...clean.round,answer:'0'}}).verified,false);
 assert.equal(verifyRound({...clean,blockTimestamp:5000}).verified,false);
 assert.equal(verifyRound({...clean,round:{...clean.round,updatedAt:1002}}).verified,false);
 console.log(JSON.stringify({success:true,build:'12.9.24',unitAssertionsPassed:7,liveOracleChecked:false,livePricingVerified:false,qualified:0,alerts:[],readOnly:true,mainnetBroadcast:false}));
 if(process.env.BASE_RPC_URL)checkLive({rpcUrl:process.env.BASE_RPC_URL,txHash:process.env.EVIDENCE_TX_HASH}).then(x=>{console.log(JSON.stringify(x));if(!x.verified)process.exitCode=1}).catch(e=>{console.error('BASE_ORACLE_FAILED',String(e?.shortMessage||e?.message||e).replace(/https?:\/\/\S+/g,'[REDACTED]').slice(0,300));process.exitCode=1});
}
