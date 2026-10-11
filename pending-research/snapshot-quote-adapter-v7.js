'use strict';
// Map a consistent research snapshot to an oriented, theoretical V2 quote.
// No caller-controlled verification flag is promoted to actionable status.
const {getAddress}=require('ethers');
const {quoteV2ExactIn}=require('./v2-theoretical-quote-v7');
function addr(x){try{return getAddress(x).toLowerCase()}catch{return null}}
function quoteFromResearchSnapshot({snapshot,tokenIn,tokenOut,amountInRaw}={}){
 const base={valid:false,readOnly:true,identityVerified:false,feeVerified:false,profitVerified:false,alertEligible:false,executionEligible:false};
 if(!snapshot?.snapshotReady||!snapshot?.correlation?.consistent)return {...base,reason:'SNAPSHOT_NOT_READY'};
 const a=addr(tokenIn),b=addr(tokenOut),t0=addr(snapshot.token0),t1=addr(snapshot.token1);
 if(!a||!b||!t0||!t1||a===b||!((a===t0&&b===t1)||(a===t1&&b===t0)))return {...base,reason:'TOKEN_DIRECTION_MISMATCH'};
 if(!Number.isSafeInteger(snapshot.blockNumber)||snapshot.blockNumber!==snapshot.correlation.blockNumber)return {...base,reason:'SNAPSHOT_BLOCK_MISMATCH'};
 if(!Number.isSafeInteger(snapshot.chainId)||snapshot.chainId!==snapshot.correlation.chainId)return {...base,reason:'SNAPSHOT_CHAIN_MISMATCH'};
 if(typeof snapshot.blockHash!=='string'||!/^0x[0-9a-f]{64}$/i.test(snapshot.blockHash)||snapshot.blockHash.toLowerCase()!==snapshot.correlation.blockHash?.toLowerCase())return {...base,reason:'SNAPSHOT_BLOCK_HASH_MISMATCH'};
 if(!addr(snapshot.pool)||addr(snapshot.pool)!==addr(snapshot.correlation.pool))return {...base,reason:'SNAPSHOT_POOL_MISMATCH'};
 const forward=a===t0;
 const reserveInRaw=forward?snapshot.reserve0Raw:snapshot.reserve1Raw;
 const reserveOutRaw=forward?snapshot.reserve1Raw:snapshot.reserve0Raw;
 const quote=quoteV2ExactIn({amountInRaw,reserveInRaw,reserveOutRaw,feeBps:snapshot.feeBps});
 if(!quote.valid)return {...base,reason:'THEORETICAL_QUOTE_INVALID',quote};
 return {...base,valid:true,reason:'THEORETICAL_QUOTE_UNAUTHENTICATED',pool:snapshot.pool,blockNumber:snapshot.blockNumber,tokenIn:a,tokenOut:b,amountInRaw:quote.amountInRaw,amountOutRaw:quote.amountOutRaw,feeBps:snapshot.feeBps,feeSourceVerified:false,limitations:['Pool identity and fee not independently authenticated','No executable simulation or gas estimate']};
}
module.exports={quoteFromResearchSnapshot};
