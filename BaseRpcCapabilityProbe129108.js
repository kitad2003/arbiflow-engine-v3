'use strict';
// Read-only provider capability probe. Never logs RPC URLs, keys or raw responses.
const { classify } = require('./BaseRpcErrorClass129110');
const TARGET='0xb86187ffee731a987660d6a9b7e1d7046a9a5282e8d1d6658295af2e9967063c';
async function request(url,method,params){
 try{
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)});
  const body=await response.text();
  let obj;try{obj=JSON.parse(body)}catch{obj=null}
  const code=typeof obj?.error?.code==='number'?obj.error.code:null;
  const resultPresent=Object.prototype.hasOwnProperty.call(obj||{},'result')&&obj.result!==null;
  return {httpStatus:response.status,rpcErrorCode:code,diagnosis:classify(response.status,code),hasJson:!!obj,resultPresent,
   category:!response.ok?'HTTP_REJECTED':code!==null?'JSON_RPC_ERROR':resultPresent?'SUCCESS':'UNEXPECTED_RESPONSE'};
 }catch(e){return {category:'TRANSPORT_FAILURE',errorCode:typeof e?.code==='string'?e.code:null}}
}
async function main(){
 const url=process.env.BASE_RPC_URL;
 if(!url||!url.startsWith('https://')){console.log(JSON.stringify({status:'BLOCKED',reason:'HTTPS_RPC_SECRET_MISSING'}));process.exitCode=2;return}
 const tests=[
  ['chainId','eth_chainId',[]],
  ['traceCall','debug_traceTransaction',[TARGET,{tracer:'callTracer',timeout:'10s'}]],
  ['tracePrestate','debug_traceTransaction',[TARGET,{tracer:'prestateTracer',tracerConfig:{diffMode:true},timeout:'10s'}]]
 ];
 const checks=[];
 for(const [name,method,params] of tests){
  const result=await request(url,method,params);
  checks.push({name,...result});
  if(result.diagnosis==='RATE_LIMIT')break; // Avoid further costly calls after throttling.
 }
 const traceReady=checks.length===3&&checks[1].resultPresent&&checks[2].resultPresent;
 console.log(JSON.stringify({build:'12.9.110',mode:'BASE_RPC_CAPABILITY_PROBE',readOnly:true,mainnetBroadcast:false,traceReady,checks}));
 if(!traceReady)process.exitCode=2;
}
main().catch(()=>{console.log(JSON.stringify({status:'BLOCKED',reason:'PROBE_FAILURE'}));process.exitCode=2});
