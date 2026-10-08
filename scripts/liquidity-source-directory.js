"use strict";
/**
 * Independent liquidity source inventory (read-only).
 * Usage: node scripts/liquidity-source-directory.js
 * Requires Node 18+. Does not import or change ArbiFlow server.
 * Sources: LI.FI /v1/tools and 1inch /liquidity-sources (when API key is supplied).
 * Do not sum provider source counts: aggregators overlap.
 */
const fs = require("node:fs");
const CHAIN_IDS = (process.env.ARBIFLOW_DIRECTORY_CHAIN_IDS || "8453,1,42161,10,137,56").split(",").map(x=>Number(x.trim())).filter(Number.isInteger);
const timeoutMs = 12000;
async function getJson(url, headers={}) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  try {
    const r = await fetch(url,{headers:{accept:"application/json",...headers},signal:controller.signal});
    const raw=await r.text(); let body;
    try {body=JSON.parse(raw);} catch {throw Error("NON_JSON_HTTP_"+r.status);}
    if(!r.ok) throw Error("HTTP_"+r.status+":"+String(body.message||body.error||"request failed").slice(0,180));
    return body;
  } finally {clearTimeout(timer);}
}
function names(items) {
  if(!Array.isArray(items)) return [];
  return [...new Set(items.map(x=>typeof x==="string"?x:(x?.key||x?.name||x?.id||x?.title)).filter(x=>typeof x==="string"&&x.length>0))].sort();
}
async function run(){
  const out={generatedAt:new Date().toISOString(),mode:"READ_ONLY",scope:"PROVIDER_REPORTED_NOT_VERIFIED_EXECUTABLE",chainIds:CHAIN_IDS,providers:{},chains:{},warnings:["Provider lists are not unique DEX counts.","No executable routes or flash-loan compatibility are implied."]};
  const lifiHeaders=process.env.LIFI_API_KEY?{"x-lifi-api-key":process.env.LIFI_API_KEY}:{};
  try {
    const data=await getJson("https://li.quest/v1/tools",lifiHeaders);
    out.providers.lifi={status:"OK",source:"https://li.quest/v1/tools",bridges:names(data.bridges),exchanges:names(data.exchanges)};
  } catch(e){out.providers.lifi={status:"ERROR",reason:String(e.message)};}
  const key=process.env.ONEINCH_API_KEY;
  if(!key) out.providers.oneinch={status:"UNCONFIGURED",reason:"ONEINCH_API_KEY not set"};
  for(const chainId of CHAIN_IDS) {
    const chain={chainId,oneinch:{status:"UNCONFIGURED"}};
    if(key) {
      try {
        const url="https://api.1inch.dev/swap/v6.0/"+chainId+"/liquidity-sources";
        const data=await getJson(url,{Authorization:"Bearer "+key});
        chain.oneinch={status:"OK",source:url,protocols:names(data.protocols),protocolCount:Array.isArray(data.protocols)?data.protocols.length:0};
      } catch(e){chain.oneinch={status:"ERROR",reason:String(e.message)};}
    }
    out.chains[String(chainId)]=chain;
  }
  const path=process.env.ARBIFLOW_DIRECTORY_OUTPUT||"liquidity-source-directory.json";
  fs.writeFileSync(path,JSON.stringify(out,null,2)+"\n");
  process.stdout.write(JSON.stringify({output:path,providerStatus:Object.fromEntries(Object.entries(out.providers).map(([k,v])=>[k,v.status])),chains:Object.values(out.chains).map(x=>({chainId:x.chainId,oneinch:x.oneinch.status,protocolCount:x.oneinch.protocolCount||0}))},null,2)+"\n");
}
run().catch(e=>{console.error("DIRECTORY_FAILED",e.message);process.exitCode=1;});
