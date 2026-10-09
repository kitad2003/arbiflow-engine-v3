'use strict';
// Shared bounded scheduling for ArbiFlow diagnostic calls. Prevents request bursts.
class RpcPacer{
 constructor({gapMs=60,parallel=2,retries=3}={}){
  this.gapMs=gapMs;this.parallel=parallel;this.retries=retries;this.queue=[];this.active=0;this.nextAt=0;
  this.stats={scheduled:0,completed:0,failed:0,retries:0,rateLimited:0,maxQueue:0};
 }
 async wait(ms){return new Promise(r=>setTimeout(r,ms))}
 run(fn){this.stats.scheduled++;return new Promise((resolve,reject)=>{this.queue.push({fn,resolve,reject});this.stats.maxQueue=Math.max(this.stats.maxQueue,this.queue.length);this.pump()})}
 pump(){
  while(this.active<this.parallel&&this.queue.length){
   const item=this.queue.shift();this.active++;
   (async()=>{
    const delay=Math.max(0,this.nextAt-Date.now());this.nextAt=Math.max(Date.now(),this.nextAt)+this.gapMs;if(delay)await this.wait(delay);
    for(let attempt=0;attempt<=this.retries;attempt++){
     try{const result=await item.fn();this.stats.completed++;item.resolve(result);return}
     catch(e){
      const err=String(e?.shortMessage||e?.message||e),limited=/429|rate.limit|too many requests|compute units/i.test(err);
      if(limited)this.stats.rateLimited++;
      if(!limited||attempt===this.retries){this.stats.failed++;item.reject(e);return}
      this.stats.retries++;await this.wait(Math.min(5000,250*2**attempt));
     }
    }
   })().finally(()=>{this.active--;this.pump()});
  }
 }
}
module.exports={RpcPacer};
