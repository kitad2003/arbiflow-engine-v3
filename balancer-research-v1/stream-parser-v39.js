'use strict';
// V39 bounded, incremental SSE parsing. Oversized frames are dropped,
// not treated as an entire-stream failure; incomplete frames persist across chunks.
const {parseSSE}=require('./mevshare-v9');
function makeParser({maxFrameBytes=2*1024*1024}={}){
 let buffer='',dropping=false;const stats={frames:0,oversizedFrames:0,invalidFrames:0};
 function push(chunk){
  buffer+=chunk;const events=[];
  while(true){
   const m=/\r?\n\r?\n/.exec(buffer);
   if(!m)break;
   const frame=buffer.slice(0,m.index);
   buffer=buffer.slice(m.index+m[0].length);
   if(dropping){dropping=false;stats.oversizedFrames++;continue}
   if(Buffer.byteLength(frame)>maxFrameBytes){stats.oversizedFrames++;continue}
   stats.frames++;
   for(const value of parseSSE(frame+'\n\n')){
    if(value?.invalidJSON){stats.invalidFrames++;continue}
    events.push(value);
   }
  }
  if(Buffer.byteLength(buffer)>maxFrameBytes){buffer='';dropping=true}
  return events;
 }
 return {push,snapshot:()=>({...stats,bufferedBytes:Buffer.byteLength(buffer),dropping})};
}
module.exports={makeParser};
