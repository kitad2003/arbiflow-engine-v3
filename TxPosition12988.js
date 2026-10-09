'use strict';
// Transaction-position historical research: only if swap TX is the LAST TX in a block
// may block-end quotes be described as immediately post-transaction state.
// No arbitrary previous-block replays; no economic-profit claims.
const {ethers}=require('ethers'),fs=require('node:fs'),assert=require('node:assert/strict');
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',WETH='0x4200000000000000000000000000000000000006';
const UNI='0x222ca98f00ed15b1fae10b61c277703a194cf5d2',AERO='0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0';
const AAVE='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const TXS=[
'0xa923b3758e740bacae742cae01637d9a2e64abd7597497f7361aaa7e897498f0',
'0xbcb6e3558691d6311ecba3df38d2c5691e862a7e8a0cd44ba35a272953a41389',
'0x93ae59df28caec4bd0f2dc70738c359d5e45bfb4b86c958eb5d615806cf1cc56',
'0xdd371300c3a7d21d5435b924d0c4d465719ca134e518cbd67a489e977f43c4c9',
'0x015c48ca5d97cb7e9c122d1650bb4bef6fa83be689a3f3f884ec2a75c1c5a9c4',
'0xfdcee2db73cbb76fc39f5548163783381473915da5573992c6e47b31c45940c0',
'0x2bb1eb6423ce387661731be584bd0483bb91836fb25b7196d38d62ab4472e13c',
'0xe8a5e1f5914bb8be16d9ff78b00d7d58feef348399b11dc5dfaa1c9133f21bec',
'0x103d82accc113664618540604cef9d13f3fd9a5ed23cca6925dcc0bcc877a8e0',
'0x0e265d7f5a30ce5c1d2f31a25ce6a02f14107477fbcd1d74afb2d306cfcfb69a',
'0x4b0dd34e742962465cb72493861b640356c970a7b45ee8ce4d3784359ab1341e',
'0x0dc66a3afb4201f5aed584466abb79e9268215db83793c8984dcee5de8a76ee6'];
function error(e){return String(e?.shortMessage||e?.reason||e?.code||e?.message||e).replace(/https?:\/\/\S+/g,'[RPC]').slice(0,170)}
async function main(){
 const url=process.env.BASE_RPC_URL;assert(/^https:\/\//.test(url||''),'BASE_RPC_URL_REQUIRED');
 const p=new ethers.JsonRpcProvider(url,8453,{staticNetwork:true});
 const out={build:'12.9.88',mode:'HISTORICAL_TRANSACTION_POSITION_AND_END_OF_BLOCK_QUOTE',status:'BLOCKED',
  txTotal:TXS.length,lastInBlockCount:0,quotesCompleted:0,quotesFailed:0,positiveBeforeGas:0,rows:[],
  qualifications:0,alerts:[],readOnly:true,mainnetBroadcast:false,executionEligible:false,fundsMovedOnMainnet:false,
  exactTransactionPositionProven:false,atomicForkReplayVerified:false};
 try{
  assert.equal((await p.getNetwork()).chainId,8453n);
  const uni=new ethers.Contract(UNI,['function quoteExactInputSingle((address,address,uint256,uint24,uint160)) returns(uint256,uint160,uint32,uint256)'],p);
  const aero=new ethers.Contract(AERO,['function quoteExactInputSingle((address,address,uint256,int24,uint160)) returns(uint256,uint160,uint32,uint256)'],p);
  const lender=new ethers.Contract(AAVE,['function FLASHLOAN_PREMIUM_TOTAL() view returns(uint128)'],p);
  const quote=async(v,a,b,n,block)=>BigInt((v==='UNI'?await uni.quoteExactInputSingle.staticCall([a,b,n,500,0],{blockTag:block}):await aero.quoteExactInputSingle.staticCall([a,b,n,100,0],{blockTag:block}))[0]);
  for(const hash of TXS){
   const row={hash,eligiblePostTxState:false,reason:null};out.rows.push(row);
   try{
    const rc=await p.getTransactionReceipt(hash);
    if(!rc){row.reason='RECEIPT_UNAVAILABLE';continue}
    const b=await p.getBlock(rc.blockNumber);
    row.block=rc.blockNumber;row.transactionIndex=rc.index;row.blockTxCount=b.transactions.length;
    if(rc.index!==b.transactions.length-1){row.reason='NOT_LAST_TX_CANNOT_RECONSTRUCT_POST_TX_WITH_BLOCK_END_QUOTE';continue}
    out.lastInBlockCount++;row.eligiblePostTxState=true;row.reason='BLOCK_END_EQUALS_POST_TX_STATE';
    const fee=BigInt(await lender.FLASHLOAN_PREMIUM_TOTAL({blockTag:rc.blockNumber}));row.quotes=[];
    for(const [first,second] of [['UNI','AERO'],['AERO','UNI']]){
     for(const size of [100,500,1000,2500]){
      try{
       const n=BigInt(size)*1000000n;
       const m=await quote(first,USDC,WETH,n,rc.blockNumber);
       const ret=await quote(second,WETH,USDC,m,rc.blockNumber);
       const preGas=ret-n-(n*fee+9999n)/10000n;
       const spreadBps=Number((ret-n)*10000n/n);
       out.quotesCompleted++;if(preGas>0n)out.positiveBeforeGas++;
       row.quotes.push({direction:first+'->'+second,sizeUsdc:size,returnUsdc:ethers.formatUnits(ret,6),
        beforeGasNetUsdc:ethers.formatUnits(preGas,6),spreadBps,
        researchPositive:preGas>0n,aboveDashboardSpread:spreadBps>50,
        executionQualified:false});
      }catch(e){out.quotesFailed++;row.quoteError=error(e)}
     }
    }
   }catch(e){row.reason='RPC_OR_HISTORY_ERROR';row.error=error(e)}
  }
  out.status=out.lastInBlockCount===0?'NO_LAST_IN_BLOCK_SAMPLES':out.quotesCompleted?'POST_TRANSACTION_QUOTES_COMPLETE':'QUOTE_BLOCKED';
  out.reason=out.lastInBlockCount===0?'EXACT_TX_STATE_NOT_AVAILABLE_FROM_BLOCK_END_FOR_SELECTED_TXS':
    'VALID_LAST_IN_BLOCK_POST_TX_QUOTES_STILL_REQUIRE_GAS_AND_EXECUTION_PROOF';
  out.exactTransactionPositionProven=out.lastInBlockCount>0;
  out.limitations=['Only last-in-block swap transactions are eligible','Block-end quote equals post-trigger state only if trigger is last transaction','No transaction-bundle position, gas conversion, flashloan, atomic fork, or capture guarantee','Quote availability at a historical block may require archive-capable RPC'];
 }catch(e){out.status='BLOCKED';out.reason=error(e)}
 finally{p.destroy()}
 fs.writeFileSync('arbiflow-tx-position-12988.json',JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify(out));
}
if(require.main===module){main().catch(e=>{console.error('POSITION_12988_FAILED',error(e));process.exitCode=1})}
module.exports={main};
