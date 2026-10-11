'use strict';
// Read-only research round trip from two oriented snapshots.
// No caller-supplied verification flags can authorize execution or dashboard alerts.
const {getAddress}=require('ethers');
const {quoteFromResearchSnapshot}=require('./snapshot-quote-adapter-v7');
const addr=x=>{try{return getAddress(x).toLowerCase()}catch{return null}};
const hash=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/i.test(x)?x.toLowerCase():null;
function quoteSnapshotRoundTrip({firstSnapshot,secondSnapshot,tokenIn,intermediateToken,amountInRaw}={}){
 const base={valid:false,readOnly:true,profitVerified:false,alertEligible:false,executionEligible:false};
 if(!firstSnapshot?.snapshotReady||!secondSnapshot?.snapshotReady)return {...base,reason:'SNAPSHOT_NOT_READY'};
 const a=addr(tokenIn),b=addr(intermediateToken),p=addr(firstSnapshot.pool),q=addr(secondSnapshot.pool);
 if(!a||!b||a===b)return {...base,reason:'INVALID_TOKEN_PATH'};
 if(!p||!q||p===q)return {...base,reason:'INVALID_OR_DUPLICATE_POOLS'};
 if(!Number.isSafeInteger(firstSnapshot.chainId)||firstSnapshot.chainId!==secondSnapshot.chainId)return {...base,reason:'CHAIN_MISMATCH'};
 if(!Number.isSafeInteger(firstSnapshot.blockNumber)||firstSnapshot.blockNumber!==secondSnapshot.blockNumber||!hash(firstSnapshot.blockHash)||hash(firstSnapshot.blockHash)!==hash(secondSnapshot.blockHash))return {...base,reason:'BLOCK_MISMATCH'};
 if(!firstSnapshot.correlation?.consistent||!secondSnapshot.correlation?.consistent)return {...base,reason:'UNCORRELATED_SNAPSHOTS'};
 if(!hash(firstSnapshot.correlation.blockHash)||hash(firstSnapshot.correlation.blockHash)!==hash(secondSnapshot.correlation.blockHash))return {...base,reason:'CORRELATION_BLOCK_HASH_MISMATCH'};
 const first=quoteFromResearchSnapshot({snapshot:firstSnapshot,tokenIn:a,tokenOut:b,amountInRaw});
 if(!first.valid)return {...base,reason:'FIRST_LEG_INVALID',first};
 const second=quoteFromResearchSnapshot({snapshot:secondSnapshot,tokenIn:b,tokenOut:a,amountInRaw:first.amountOutRaw});
 if(!second.valid)return {...base,reason:'SECOND_LEG_INVALID',first,second};
 const delta=BigInt(second.amountOutRaw)-BigInt(first.amountInRaw);
 return {...base,valid:true,reason:'THEORETICAL_SNAPSHOT_ROUND_TRIP_ONLY',chainId:firstSnapshot.chainId,blockNumber:firstSnapshot.blockNumber,tokenIn:a,intermediateToken:b,amountInRaw:first.amountInRaw,amountOutRaw:second.amountOutRaw,grossDeltaRaw:String(delta),positiveGross:delta>0n,first,second,limitations:['No authenticated fee or deployment provenance','No gas or atomic execution simulation','No verified profit or dashboard alert']};
}
module.exports={quoteSnapshotRoundTrip};
