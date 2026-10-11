'use strict';
// Isolated, read-only platform shell. No engine calls, secrets, signing or trading.
const fs=require('node:fs');
const path=require('node:path');
function mount(app){
 const file=path.join(__dirname,'arbiflow-platform.html');
 app.get('/platform',(req,res)=>res.type('html').send(fs.readFileSync(file,'utf8')));
 app.get('/platform/health',(req,res)=>res.json({success:true,mode:'READ_ONLY',modules:['overview','bots','arbitrage','intelligence','risk'],mainnetBroadcast:false,executionEnabled:false}));
}
module.exports={mount};
