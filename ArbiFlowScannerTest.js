'use strict';
const assert=require('node:assert/strict'),http=require('node:http');
const {analyze}=require('./ArbiFlowPrivateProcessor');
const {server}=require('./ArbiFlowScannerService');
async function main(){
 const sample={createdAt:'2026-10-09T00:00:00Z',results:{triangular:[{path:'USDC>WETH>DAI>USDC',pools:['a','b','c'],sizes:[{success:true,sizeUsdc:10000,grossUsdc:140,afterAaveBeforeGasUsdc:135}]}],twoPool:[]}};
 const checked=analyze(sample);assert.equal(checked.counts.evaluated,1);assert.equal(checked.counts.spreadOverHalfPercent,1);assert.equal(checked.counts.positiveAfterAave,1);
 assert.equal(checked.qualified.length,0);assert.equal(checked.diagnostics[0].executionEligible,false);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const port=server.address().port;
  const request=route=>new Promise((resolve,reject)=>http.get({hostname:'127.0.0.1',port,path:route},r=>{let body='';r.on('data',s=>body+=s);r.on('end',()=>resolve({status:r.statusCode,body}))}).on('error',reject));
  const h=await request('/health');assert.equal(h.status,200);assert.equal(JSON.parse(h.body).executionEligible,false);
  const a=await request('/api/scanner');assert.equal(a.status,200);assert.equal(JSON.parse(a.body).qualified.length,0);
  const page=await request('/');assert.equal(page.status,200);assert(page.body.includes('ARBIFLOW'));
  console.log(JSON.stringify({success:true,build:'PRO_INTEGRATION_1',assertionsPassed:9,localApiVerified:true,qualified:0,readOnly:true}));
 }finally{await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
