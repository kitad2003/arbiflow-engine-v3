'use strict';
// ArbiFlow V4: fail-closed Solana mint authority and extension screening.
// JSON-parsed RPC data is only an authority screening step, NOT proof of sellability.
const {run}=require('./solana-movers-v3');
const WRAPPED_SOL='So11111111111111111111111111111111111111112';
const LEGACY='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN2022='TokenzQdBNbLqP5VEhdkAS6EPF2kVbAD6hYtGr4R'; // replaced below with canonical value at runtime if needed
const TOKEN2022_CANONICAL='TokenzQdBNbLqP5VEhdkAS6EPF2kVbAD6hYtGr4R';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function screen(mint,account){
 const fail=(reason,extra={})=>({mint,accepted:false,reason,...extra});
 if(!account||!account.data||!account.owner)return fail('MINT_ACCOUNT_UNAVAILABLE');
 if(account.owner!==LEGACY&&account.owner!==TOKEN2022_CANONICAL)return fail('UNSUPPORTED_OWNER',{owner:account.owner});
 const data=account.data;
 if(data.program!=='spl-token'&&data.program!=='spl-token-2022')return fail('UNEXPECTED_PARSED_PROGRAM');
 const p=data.parsed;
 if(!p||p.type!=='mint'||!p.info)return fail('NOT_PARSED_MINT');
 const info=p.info;
 if(info.freezeAuthority!==null)return fail('FREEZE_AUTHORITY_NOT_REVOKED');
 if(info.mintAuthority!==null)return fail('MINT_AUTHORITY_NOT_RENOUNCED');
 if(account.owner===TOKEN2022_CANONICAL){
  // Fail closed on ALL extensions until a comprehensive supported-extension decoder exists.
  // JSON-parsed output may not enumerate all extensions, so never approve Token-2022 here.
  return fail('TOKEN_2022_EXTENSIONS_NOT_FULLY_AUDITED',{extensions:Array.isArray(info.extensions)?info.extensions.map(x=>x.extension):[]});
 }
 if(account.owner!==LEGACY)return fail('UNKNOWN_TOKEN_PROGRAM');
 if(mint===WRAPPED_SOL)return {mint,accepted:true,reason:'LEGACY_WRAPPED_SOL_MINT_AUTHORITIES_REVOKED',scope:'MINT_AUTHORITY_ONLY',taxVerified:false,sellabilityVerified:false};
 return {mint,accepted:true,reason:'LEGACY_MINT_AUTHORITIES_REVOKED',scope:'MINT_AUTHORITY_ONLY',taxVerified:false,sellabilityVerified:false};
}
async function audit(mints,{rpcUrl,fetchImpl=fetch,delayMs=350,maxMints=30}={}){
 if(!rpcUrl)throw Error('SOLANA_RPC_URL_REQUIRED');
 const unique=[...new Set(mints)].slice(0,maxMints),results=[];
 for(let i=0;i<unique.length;i++){
  if(i)await sleep(delayMs);
  const mint=unique[i];
  try{
   const response=await fetchImpl(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:i+1,method:'getAccountInfo',params:[mint,{encoding:'jsonParsed',commitment:'confirmed'}]})});
   if(!response.ok)throw Error('HTTP_'+response.status);
   const body=await response.json();
   if(body.error)throw Error('RPC_ERROR_'+String(body.error.code||'UNKNOWN'));
   results.push(screen(mint,body.result?.value));
  }catch(e){results.push({mint,accepted:false,reason:'RPC_VERIFICATION_FAILED',error:String(e.message).slice(0,80)})}
 }
 return {mintsChecked:unique.length,mintAuthorityScreenPassed:results.filter(x=>x.accepted).length,rejectedOrUnknown:results.filter(x=>!x.accepted).length,results};
}
async function main(){
 const discovery=await run({maxTokens:Math.min(18,Math.max(1,Number(process.env.MAX_TOKENS)||12)),trendingPages:1});
 const mints=[...new Set(discovery.crossDexPools.flatMap(p=>[p.baseMint,p.quoteMint]))];
 if(!process.env.SOLANA_RPC_URL)return {build:'ARBIFLOW_SOLANA_SAFETY_V4',discovery:{crossDexPairs:discovery.crossDexPairs,crossDexPools:discovery.crossDexPools.length},safety:{mintsChecked:0,reason:'SOLANA_RPC_URL_NOT_CONFIGURED'},safeToQuote:[],verifiedSafePools:0,verifiedProfitableRoutes:0,alerts:[],executionEligible:false,mainnetBroadcast:false};
 const safety=await audit(mints,{rpcUrl:process.env.SOLANA_RPC_URL});
 return {build:'ARBIFLOW_SOLANA_SAFETY_V4',discovery:{crossDexPairs:discovery.crossDexPairs,crossDexPools:discovery.crossDexPools.length},safety,safeToQuote:[],verifiedSafePools:0,verifiedProfitableRoutes:0,alerts:[],executionEligible:false,mainnetBroadcast:false,limitations:['MINT_AUTHORITY_SCREEN_ONLY','TOKEN_TAX_AND_SELLABILITY_NOT_VERIFIED','TOKEN_2022_ALWAYS_REJECTED_PENDING_COMPLETE_AUDIT','NO_QUOTES_OR_ATOMIC_SIMULATION']};
}
if(require.main===module)main().then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error(e);process.exitCode=1});
module.exports={screen,audit,main};
