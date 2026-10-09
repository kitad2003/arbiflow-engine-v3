'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {fromReportFile}=require('./ArbiFlowPrivateProcessor');
const PORT=Number(process.env.ARBIFLOW_SCANNER_PORT||8787);
const REPORT=process.env.ARBIFLOW_SCANNER_REPORT||path.join(__dirname,'arbiflow-triangles-12962.json');
const PAGE=path.join(__dirname,'ArbiFlowProScanner.html');
const send=(res,code,data,type='application/json')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"});res.end(data)};
const server=http.createServer((req,res)=>{
 if(req.method!=='GET')return send(res,405,JSON.stringify({error:'METHOD_NOT_ALLOWED'}));
 if(req.url==='/'||req.url==='/scanner')return send(res,200,fs.readFileSync(PAGE,'utf8'),'text/html; charset=utf-8');
 if(req.url==='/api/scanner'){const output=fromReportFile(REPORT);return send(res,200,JSON.stringify({success:true,build:'PRO_INTEGRATION_1',source:fs.existsSync(REPORT)?'LOCAL_DIAGNOSTIC_REPORT':'NO_REPORT_AVAILABLE',createdAt:new Date().toISOString(),...output}))}
 if(req.url==='/health')return send(res,200,JSON.stringify({ok:true,readOnly:true,executionEligible:false}));
 return send(res,404,JSON.stringify({error:'NOT_FOUND'}));
});
if(require.main===module){if(!Number.isSafeInteger(PORT)||PORT<1||PORT>65535)throw Error('BAD_PORT');server.listen(PORT,'127.0.0.1',()=>console.log('ARBIFLOW_SCANNER_LOCAL_ONLY '+PORT))}
module.exports={server};
