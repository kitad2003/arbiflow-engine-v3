'use strict';
// Research-only aggregate. No caller-controlled flags may authorize a trade or dashboard alert.
const {correlatePoolEvidence}=require('./pool-evidence-correlation-v7');
const {assessV2FeeEvidence}=require('./v2-fee-evidence-v7');
function buildResearchPoolSnapshot({chainEvidence,poolState,manifest,feeBps,feeSource}={}){
 const base={snapshotReady:false,identityVerified:false,feeVerified:false,alertEligible:false,executionEligible:false,readOnly:true};
 const correlation=correlatePoolEvidence({chainEvidence,poolState,manifest});
 if(!correlation.consistent)return {...base,reason:'INCONSISTENT_POOL_EVIDENCE',correlation};
 const fee=assessV2FeeEvidence({poolEvidence:correlation,feeBps,source:feeSource});
 if(typeof poolState.reserve0Raw!=='string'||!/^[1-9][0-9]*$/.test(poolState.reserve0Raw)||typeof poolState.reserve1Raw!=='string'||!/^[1-9][0-9]*$/.test(poolState.reserve1Raw))return {...base,reason:'INVALID_RESERVES',correlation,fee};
 if(!poolState.token0||!poolState.token1||poolState.token0===poolState.token1)return {...base,reason:'INVALID_TOKENS',correlation,fee};
 return {...base,snapshotReady:true,reason:'RESEARCH_SNAPSHOT_ONLY',chainId:correlation.chainId,blockNumber:correlation.blockNumber,blockHash:correlation.blockHash,pool:correlation.pool,factory:correlation.factory,token0:poolState.token0,token1:poolState.token1,reserve0Raw:poolState.reserve0Raw,reserve1Raw:poolState.reserve1Raw,feeBps:Number.isSafeInteger(feeBps)?feeBps:null,correlation,fee,limitations:['Fee and deployment identity not independently authenticated','Snapshot is not an executable quote','No gas, slippage or atomic simulation']};
}
module.exports={buildResearchPoolSnapshot};
