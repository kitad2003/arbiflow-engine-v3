'use strict';
// Phase 9.1 event-driven read-only Base scanner. Requires ARBIFLOW_BASE_WSS_URL.
// No wallet access, signing, relay submission or transaction broadcasting.
const {WebSocketProvider,Interface}=require('ethers');
const ABI=new Interface(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
const POOLS=[
 {name:'UNISWAP_V3_500',address:'0xd0b53D9277642d899DF5C87A3966A349A798F224'},
 {name:'UNISWAP_V3_3000',address:'0x6c561B446416E1A00E8E93E221854d6eA4171372'},
 {name:'PANCAKE_V3_500',address:'0xB775272E537cc670C65DC852908aD47015244EaF'}
];
const safety={readOnly:true,mainnetBroadcast:false,executionEligible:false};
function mount(app){
 let provider=null,timer=null;
 const state={status:'STOPPED',events:0,blocks:0,lastEvent:null,lastBlock:null,lastError:null,reconnects:0,startedAt:null,triggeredRequotes:0};
 const history=[];let generation=0;const instanceId=require('crypto').randomBytes(6).toString('hex');
 const autoStart=!!process.env.ARBIFLOW_BASE_WSS_URL && process.env.ARBIFLOW_PHASE91_AUTOSTART!=='false';
 const trim=e=>String(e?.message||e).replace(/wss?:\/\/[^\s]+/gi,'[REDACTED]').slice(0,180);
 const record=e=>{history.push(e);if(history.length>50)history.shift()};
 async function disconnect(){
  if(timer){clearTimeout(timer);timer=null}
  const old=provider;provider=null;
  if(old){try{await old.destroy()}catch(_){}}
 }
 async function connect(epoch){
  if(epoch!==generation)return;
  const url=process.env.ARBIFLOW_BASE_WSS_URL;
  if(!url||!/^wss:\/\//i.test(url)){state.status='NOT_CONFIGURED';state.lastError='SET_ARBIFLOW_BASE_WSS_URL';return}
  state.status='CONNECTING';
  let ws;
  try{
   ws=new WebSocketProvider(url,8453,{staticNetwork:true});provider=ws;
   const network=await ws.getNetwork();
   if(epoch!==generation)return;
   if(Number(network.chainId)!==8453)throw Error('WRONG_CHAIN');
   ws.on('block',number=>{if(epoch!==generation)return;state.blocks++;state.lastBlock={number,receivedAt:new Date().toISOString()}});
   for(const pool of POOLS){
    const filter={address:pool.address,topics:[ABI.getEvent('Swap').topicHash]};
    ws.on(filter,log=>{
     if(epoch!==generation)return;
     try{
      const parsed=ABI.parseLog(log);
      const event={pool:pool.name,blockNumber:log.blockNumber,transactionHash:log.transactionHash,receivedAt:new Date().toISOString(),amount0:parsed.args.amount0.toString(),amount1:parsed.args.amount1.toString(),source:'CONFIRMED_LOG'};
      state.events++;state.lastEvent=event;record(event);
      // Candidate notification only; no unbounded automatic RPC scans.
      state.triggeredRequotes++;state.lastCandidate={pair:'USDC/WETH',affectedPool:pool.name,status:'REQUOTE_REQUIRED',blockNumber:log.blockNumber};
     }catch(e){state.lastError=trim(e)}
    });
   }
   state.status='SUBSCRIBED';state.lastError=null;
   // Heartbeat checks transport, not chain freshness.
   timer=setTimeout(async()=>{if(epoch!==generation)return;try{await ws.getBlockNumber();timer=setTimeout(()=>heartbeat(epoch),30000)}catch(e){retry(epoch,e)}},30000);
  }catch(e){retry(epoch,e)}
 }
 async function heartbeat(epoch){
  if(epoch!==generation||!provider)return;
  try{await provider.getBlockNumber();timer=setTimeout(()=>heartbeat(epoch),30000)}
  catch(e){retry(epoch,e)}
 }
 function retry(epoch,e){
  if(epoch!==generation)return;
  state.lastError=trim(e);state.status='RECONNECTING';state.reconnects++;
  disconnect().finally(()=>{if(epoch===generation)timer=setTimeout(()=>connect(epoch),Math.min(30000,1000*Math.pow(2,Math.min(state.reconnects,5))))});
 }
 app.get('/api/phase91/status',(_req,res)=>res.json({success:true,instanceId,autoStart,uptimeSeconds:Math.floor(process.uptime()),configured:!!process.env.ARBIFLOW_BASE_WSS_URL,...state,pools:POOLS,eventsRecent:history.slice(-10),pendingMempoolSupported:false,automaticTrading:false,safety}));
 app.get('/api/phase91/start',(_req,res)=>{
  if(state.status==='SUBSCRIBED'||state.status==='CONNECTING'||state.status==='RECONNECTING')return res.json({success:true,status:state.status,safety});
  generation++;state.startedAt=new Date().toISOString();state.reconnects=0;connect(generation).catch(e=>{state.lastError=trim(e)});
  res.json({success:true,status:'CONNECTING',configured:!!process.env.ARBIFLOW_BASE_WSS_URL,safety});
 });
 app.get('/api/phase91/stop',(_req,res)=>{generation++;state.status='STOPPED';disconnect().catch(()=>{});res.json({success:true,status:'STOPPED',note:autoStart?'AUTO_START_ON_NEXT_RESTART':'MANUAL_START',safety})});
 // Start after server mounts, so a fresh Render process does not require a browser click.
 if(autoStart){state.startedAt=new Date().toISOString();setImmediate(()=>connect(++generation).catch(e=>{state.lastError=trim(e);state.status='ERROR'}));}
}
module.exports={mount};
